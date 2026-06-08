// Wave 102 — Esums Plant Soiling, Cleaning Authorisation & Recovery-Gain Audit
// tab. PV soiling is one of the single biggest controllable production losses
// on a SA solar plant. W102 audits a soiling period from baseline measurement
// (reference-cell + dirty/clean pair), through inspection (visual + IR + drone),
// economic assessment (lost MWh tariff vs cleaning ZAR + water m3), cleaning
// authorisation gate (water-restriction + neighbour notice + DFFE WUL), field
// cleaning execution, post-clean PR-delta validation, and settled audit ledger
// feeding W79 generation revenue assurance.
//
//   • KPI strip: total / open / cleaning live / authorised / measured /
//     disputed / SLA breached / total ZAR loss
//   • Filter pills by soiling tier + chain state + urgency + floor + SLA breach
//   • Listing: tier pill + floor flag + URGENT SLA countdown + soiling ratio +
//     mwh loss + ZAR loss/day
//   • Drill-down: soiling ratio + PR + ZAR ledger + cleaning ROI + recovered
//     gain + 4-step authority ladder + per-state actions + timeline
//
// Single-party write: the Esums O&M desk operates the chain; actor_party tag
// records site_supervisor / cleaning_contractor / plant_owner / regulator_observer.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'soiling_period_open' | 'inspection_scheduled' | 'field_inspected'
  | 'soiling_measured' | 'economic_assessment_done' | 'cleaning_authorized'
  | 'cleaning_in_progress' | 'post_clean_measured' | 'gain_validated'
  | 'settled' | 'disputed' | 'cancelled';

type Tier = 'minor' | 'standard' | 'material' | 'severe';

type UrgencyBand = 'low' | 'medium' | 'high' | 'critical';

type Authority = 'site_supervisor' | 'plant_manager' | 'asset_director' | 'cfo';

interface SoilRow {
  id: string;
  audit_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  facility_id: string;
  facility_name: string | null;
  plant_owner_party_id: string | null;
  plant_owner_party_name: string | null;
  installed_capacity_mw: number | null;
  technology: string | null;
  site_region: string | null;
  period_opened_at: string | null;
  period_label: string | null;
  inspection_method: string | null;
  evidence_photo_uploaded: number;
  soiling_ratio_pct: number;
  baseline_ratio_pct: number | null;
  days_since_baseline: number | null;
  soiling_velocity_pct_per_day: number | null;
  expected_pr_clean_pct: number | null;
  current_pr_dirty_pct: number | null;
  pr_loss_pct: number | null;
  peak_sun_hours_per_day: number | null;
  mwh_loss_per_day: number | null;
  tariff_zar_per_mwh: number | null;
  zar_loss_per_day: number | null;
  zar_loss_to_date: number | null;
  cleaning_method: string | null;
  cleaning_cost_zar: number | null;
  water_consumption_m3: number | null;
  recovery_horizon_days: number | null;
  cleaning_roi_ratio: number | null;
  days_to_breakeven: number | null;
  post_clean_pr_pct: number | null;
  recovered_zar: number | null;
  recovery_documented: number;
  rainy_season_window_strict: number;
  post_dust_storm_event: number;
  neighbour_complaint_filed: number;
  water_restriction_active: number;
  current_tier: Tier;
  authority_required: Authority | null;
  dispute_count: number;
  cancel_count: number;
  parent_audit_id: string | null;
  prior_audit_id: string | null;
  regulator_ref: string | null;
  cleaning_contractor_id: string | null;
  cleaning_contractor_name: string | null;
  wul_licence_ref: string | null;
  title: string | null;
  narrative: string | null;
  result_text: string | null;
  disputed_reason: string | null;
  cancelled_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  supervisor_party: string | null;
  contractor_party: string | null;
  owner_party: string | null;
  chain_status: ChainStatus;
  soiling_period_opened_at: string | null;
  inspection_scheduled_at: string | null;
  field_inspected_at: string | null;
  soiling_measured_at: string | null;
  economic_assessment_done_at: string | null;
  cleaning_authorized_at: string | null;
  cleaning_in_progress_at: string | null;
  post_clean_measured_at: string | null;
  gain_validated_at: string | null;
  settled_at: string | null;
  disputed_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Decorated by route
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  floor_at_material_flag?: boolean;
  pr_loss_pct_live?: number | null;
  mwh_loss_per_day_live?: number | null;
  zar_loss_per_day_live?: number | null;
  zar_loss_to_date_live?: number | null;
  cleaning_roi_ratio_live?: number | null;
  days_to_breakeven_live?: number | null;
  soiling_velocity_pct_per_day_live?: number | null;
  predicted_next_clean_date_live?: string | null;
  recovered_zar_live?: number | null;
  soiling_compliance_index_live?: number | null;
  sla_days_remaining_live?: number | null;
  urgency_band_live?: UrgencyBand;
  authority_required_live?: Authority;
  days_in_court_live?: number;
}

interface SoilEvent {
  id: string;
  audit_id: string;
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
  open_count: number;
  settled_count: number;
  cleaning_live_count: number;
  authorised_count: number;
  measured_count: number;
  disputed_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  total_mwh_loss_per_day: number;
  total_zar_loss_per_day: number;
  total_zar_loss_to_date: number;
  total_recovered_zar: number;
  avg_soiling_ratio_pct: number;
  avg_compliance_index: number;
  critical_urgency_count: number;
  severe_tier_count: number;
  material_tier_count: number;
  floor_at_material_count: number;
  water_restricted_count: number;
  post_dust_storm_count: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  soiling_period_open:      { bg: '#dbecfb', fg: '#1a3a5c', label: 'Period open' },
  inspection_scheduled:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Inspection scheduled' },
  field_inspected:          { bg: '#dbecfb', fg: '#1a3a5c', label: 'Field inspected' },
  soiling_measured:         { bg: '#fff4d6', fg: '#a06200', label: 'Soiling measured' },
  economic_assessment_done: { bg: '#fff4d6', fg: '#a06200', label: 'Economics assessed' },
  cleaning_authorized:      { bg: '#fff4d6', fg: '#a06200', label: 'Cleaning authorized' },
  cleaning_in_progress:     { bg: '#fde0e0', fg: '#9b1f1f', label: 'Cleaning in progress' },
  post_clean_measured:      { bg: '#daf5e2', fg: '#1f6b3a', label: 'Post-clean measured' },
  gain_validated:           { bg: '#daf5e2', fg: '#1f6b3a', label: 'Gain validated' },
  settled:                  { bg: '#e3e7ec', fg: '#557',    label: 'Settled' },
  disputed:                 { bg: '#fbd0d0', fg: '#7a1414', label: 'Disputed' },
  cancelled:                { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
  standard: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard' },
  material: { bg: '#fff4d6', fg: '#a06200', label: 'Material' },
  severe:   { bg: '#fbd0d0', fg: '#7a1414', label: 'Severe' },
};

const URGENCY_TONE: Record<UrgencyBand, { bg: string; fg: string; label: string }> = {
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
  medium:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Medium' },
  high:     { bg: '#fff4d6', fg: '#a06200', label: 'High' },
  critical: { bg: '#fbd0d0', fg: '#7a1414', label: 'Critical' },
};

const AUTH_LABEL: Record<Authority, string> = {
  site_supervisor: 'Site supervisor',
  plant_manager:   'Plant manager',
  asset_director:  'Asset director',
  cfo:             'CFO',
};

const PARTY_TONE: Record<string, { bg: string; fg: string }> = {
  site_supervisor:     { bg: '#dbecfb', fg: '#1a3a5c' },
  cleaning_contractor: { bg: '#fff4d6', fg: '#a06200' },
  plant_owner:         { bg: '#daf5e2', fg: '#1f6b3a' },
  regulator_observer:  { bg: '#fde0e0', fg: '#9b1f1f' },
  system:              { bg: '#e3e7ec', fg: '#557' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                   label: 'Active (pre-terminal)' },
  { key: 'all',                      label: 'All' },
  { key: 'severe',                   label: 'Severe' },
  { key: 'material',                 label: 'Material' },
  { key: 'standard',                 label: 'Standard' },
  { key: 'minor',                    label: 'Minor' },
  { key: 'critical_urgency',         label: 'Critical urgency' },
  { key: 'floored',                  label: 'Floor-at-material' },
  { key: 'soiling_period_open',      label: 'Period open' },
  { key: 'inspection_scheduled',     label: 'Inspection scheduled' },
  { key: 'field_inspected',          label: 'Field inspected' },
  { key: 'soiling_measured',         label: 'Measured' },
  { key: 'economic_assessment_done', label: 'Economics done' },
  { key: 'cleaning_authorized',      label: 'Authorized' },
  { key: 'cleaning_in_progress',     label: 'Cleaning live' },
  { key: 'post_clean_measured',      label: 'Post-clean' },
  { key: 'gain_validated',           label: 'Gain validated' },
  { key: 'settled',                  label: 'Settled' },
  { key: 'disputed',                 label: 'Disputed' },
  { key: 'breached',                 label: 'SLA breached' },
  { key: 'reportable',               label: 'Reportable' },
];

const TIERS = new Set<string>(['minor', 'standard', 'material', 'severe']);

function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R${(v / 1_000_000).toFixed(2)}m`;
  if (abs >= 1_000)     return `R${(v / 1_000).toFixed(0)}k`;
  return `R${v.toFixed(0)}`;
}

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return '—';
  return `${v.toFixed(digits)}%`;
}

function fmtMwh(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} MWh`;
}

export function SoilingAuditChainTab() {
  const [rows, setRows] = useState<SoilRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<SoilRow | null>(null);
  const [events, setEvents] = useState<SoilEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: SoilRow[] } }>('/esums/soiling-audit/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setKpis(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load soiling audits');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: SoilRow; events: SoilEvent[] } }>(`/esums/soiling-audit/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load audit history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')              return true;
      if (filter === 'active')           return !r.is_terminal;
      if (filter === 'breached')         return r.sla_breached;
      if (filter === 'reportable')       return r.is_reportable_flag;
      if (filter === 'critical_urgency') return r.urgency_band_live === 'critical';
      if (filter === 'floored')          return r.floor_at_material_flag;
      if (TIERS.has(filter))             return r.current_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const doAction = useCallback(async (path: string, body?: object) => {
    if (!selected) return;
    try {
      await api.post(`/esums/soiling-audit/chain/${selected.id}/${path}`, body ?? {});
      await load();
      await loadEvents(selected.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [selected, load, loadEvents]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-8 gap-3">
        <Kpi label="Total" value={kpis?.total ?? 0} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Cleaning live" value={kpis?.cleaning_live_count ?? 0} tone={(kpis?.cleaning_live_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Authorised" value={kpis?.authorised_count ?? 0} />
        <Kpi label="Severe tier" value={kpis?.severe_tier_count ?? 0} tone={(kpis?.severe_tier_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Disputed" value={kpis?.disputed_count ?? 0} tone={(kpis?.disputed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="ZAR loss / day" value={fmtZar(kpis?.total_zar_loss_per_day ?? 0)} tone={(kpis?.total_zar_loss_per_day ?? 0) > 0 ? 'warn' : 'ok'} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
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

      {err && <div className="px-3 py-2 bg-red-50 text-red-700 text-[12px] rounded-md">{err}</div>}

      <div className="bg-white border border-[#e5ebf2] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#f7f9fb] text-[11px] uppercase tracking-wide text-[#6b7685]">
            <tr>
              <th className="px-3 py-2 text-left">Audit #</th>
              <th className="px-3 py-2 text-left">Facility / period</th>
              <th className="px-3 py-2 text-right">Soiling</th>
              <th className="px-3 py-2 text-right">MWh loss / d</th>
              <th className="px-3 py-2 text-right">ZAR loss / d</th>
              <th className="px-3 py-2 text-left">Tier</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-right">Δ SLA</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {loading ? (
              <tr><td colSpan={8} className="p-6 text-center text-[#6b7685]">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-[#6b7685]">No soiling audits match the current filter.</td></tr>
            ) : filtered.map((r) => {
              const stateTone = STATE_TONE[r.chain_status];
              const tierTone  = TIER_TONE[r.current_tier];
              return (
                <tr
                  key={r.id}
                  onClick={() => loadEvents(r.id)}
                  className={`cursor-pointer hover:bg-[#f7f9fb] border-t border-[#eef2f6] ${selected?.id === r.id ? 'bg-[#fffae6]' : ''}`}>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.audit_number}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={`${r.facility_name ?? r.facility_id} · ${r.period_label ?? '—'}`}>
                    {r.facility_name ?? r.facility_id}
                    <span className="text-[#6b7685]"> · {r.period_label ?? '—'}</span>
                    {r.floor_at_material_flag && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#fff4d6] text-[#a06200]">FLOOR</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">{fmtPct(r.soiling_ratio_pct, 1)}</td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">{fmtMwh(r.mwh_loss_per_day_live)}</td>
                  <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${(r.zar_loss_per_day_live ?? 0) > 0 ? 'text-[#9b1f1f]' : 'text-[#4a5568]'}`}>
                    {fmtZar(r.zar_loss_per_day_live)}
                  </td>
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
                  <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                    {r.is_terminal ? '—' : fmtMin(r.minutes_until_sla)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <SoilingDrawer
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

function SoilingDrawer({
  row, events, onClose, doAction,
}: {
  row: SoilRow;
  events: SoilEvent[];
  onClose: () => void;
  doAction: (path: string, body?: object) => Promise<void>;
}) {
  const cs = row.chain_status;
  const transitionable = !row.is_terminal;
  const disputable = ['soiling_measured', 'economic_assessment_done', 'gain_validated'].includes(cs);
  const cancellable = !row.is_terminal;
  const urgencyTone = row.urgency_band_live ? URGENCY_TONE[row.urgency_band_live] : null;
  const authorityNow = row.authority_required_live ?? row.authority_required ?? null;

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
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">Soiling audit {row.audit_number}</div>
            <h3 className="text-[16px] font-semibold text-[#0f1c2e] mt-0.5">
              {row.facility_name ?? row.facility_id} · {row.period_label ?? '—'}
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
              {row.floor_at_material_flag && (
                <span className="px-2 py-0.5 rounded-full font-bold bg-[#fff4d6] text-[#a06200]">FLOOR @ material</span>
              )}
              {row.is_reportable_flag && (
                <span className="px-2 py-0.5 rounded-full bg-[#fde0e0] text-[#9b1f1f] font-medium">Regulator reportable</span>
              )}
              {authorityNow && (
                <span className="px-2 py-0.5 rounded-full bg-[#dbecfb] text-[#1a3a5c] font-medium">Auth: {AUTH_LABEL[authorityNow]}</span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[#6b7685] hover:text-[#0f1c2e]">✕</button>
        </div>

        <div className="p-5 space-y-4 text-[13px]">
          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Soiling measurement</div>
            <div className="grid grid-cols-4 gap-3">
              <Pair label="Current ratio" value={fmtPct(row.soiling_ratio_pct, 2)} />
              <Pair label="Baseline" value={fmtPct(row.baseline_ratio_pct, 2)} />
              <Pair label="Days since baseline" value={row.days_since_baseline != null ? `${row.days_since_baseline}d` : '—'} />
              <Pair label="Velocity" value={row.soiling_velocity_pct_per_day_live != null ? `${row.soiling_velocity_pct_per_day_live.toFixed(3)}%/d` : '—'} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Expected PR (clean)" value={fmtPct(row.expected_pr_clean_pct, 1)} />
              <Pair label="Current PR (dirty)" value={fmtPct(row.current_pr_dirty_pct, 1)} />
              <Pair label="PR loss" value={fmtPct(row.pr_loss_pct_live, 2)} />
            </div>
          </div>

          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Economic impact ledger</div>
            <div className="grid grid-cols-4 gap-3">
              <Pair label="Installed capacity" value={row.installed_capacity_mw != null ? `${row.installed_capacity_mw} MW` : '—'} />
              <Pair label="Peak sun" value={row.peak_sun_hours_per_day != null ? `${row.peak_sun_hours_per_day}h/d` : '—'} />
              <Pair label="Tariff" value={row.tariff_zar_per_mwh != null ? `R${row.tariff_zar_per_mwh.toFixed(0)}/MWh` : '—'} />
              <Pair label="MWh loss / day" value={fmtMwh(row.mwh_loss_per_day_live)} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="ZAR loss / day" value={fmtZar(row.zar_loss_per_day_live)} />
              <Pair label="ZAR loss to date" value={fmtZar(row.zar_loss_to_date_live)} />
              <Pair label="Next clean (predicted)" value={row.predicted_next_clean_date_live ? new Date(row.predicted_next_clean_date_live).toLocaleDateString() : '—'} />
            </div>
          </div>

          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Cleaning & recovery</div>
            <div className="grid grid-cols-4 gap-3">
              <Pair label="Method" value={row.cleaning_method ?? '—'} />
              <Pair label="Cost" value={fmtZar(row.cleaning_cost_zar)} />
              <Pair label="Water" value={row.water_consumption_m3 != null ? `${row.water_consumption_m3} m³` : '—'} />
              <Pair label="Horizon" value={row.recovery_horizon_days != null ? `${row.recovery_horizon_days}d` : '—'} />
            </div>
            <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="ROI ratio" value={row.cleaning_roi_ratio_live != null ? `${row.cleaning_roi_ratio_live.toFixed(2)}×` : '—'} />
              <Pair label="Days to breakeven" value={row.days_to_breakeven_live != null ? `${row.days_to_breakeven_live.toFixed(1)}d` : '—'} />
              <Pair label="Post-clean PR" value={fmtPct(row.post_clean_pr_pct, 1)} />
              <Pair label="Recovered" value={fmtZar(row.recovered_zar_live)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FlagPill on={!!row.rainy_season_window_strict} label="Rainy season strict" />
            <FlagPill on={!!row.post_dust_storm_event} label="Post dust-storm event" />
            <FlagPill on={!!row.neighbour_complaint_filed} label="Neighbour complaint" />
            <FlagPill on={!!row.water_restriction_active} label="Water restriction active" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {row.plant_owner_party_name && <Pair label="Plant owner" value={row.plant_owner_party_name} />}
            {row.cleaning_contractor_name && <Pair label="Contractor" value={row.cleaning_contractor_name} />}
            {row.wul_licence_ref && <Pair label="DFFE WUL ref" value={row.wul_licence_ref} />}
            {row.regulator_inbox_ref && <Pair label="Regulator inbox" value={row.regulator_inbox_ref} />}
            {row.inspection_method && <Pair label="Inspection method" value={row.inspection_method} />}
            {row.technology && <Pair label="Technology" value={row.technology} />}
            {row.site_region && <Pair label="Region" value={row.site_region} />}
            {row.soiling_compliance_index_live != null && (
              <Pair label="Compliance index" value={`${row.soiling_compliance_index_live.toFixed(1)} / 130`} />
            )}
            {row.disputed_reason && <Pair label="Disputed reason" value={row.disputed_reason} />}
            {row.cancelled_reason && <Pair label="Cancelled reason" value={row.cancelled_reason} />}
            {row.reason_code && <Pair label="Reason code" value={row.reason_code} />}
          </div>

          {row.source_wave && (
            <Pair label="Provenance" value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}${row.source_event ? ` (${row.source_event})` : ''}`} />
          )}

          {row.sla_deadline_at && !row.is_terminal && (
            <Pair label="Next SLA" value={`${new Date(row.sla_deadline_at).toLocaleString()} (${fmtMin(row.minutes_until_sla)})${row.escalation_level > 0 ? ` · ${row.escalation_level} breach(es)` : ''}`} />
          )}

          {transitionable && (
            <div className="border-t border-[#eef2f6] pt-4">
              <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Actions</div>
              <div className="flex flex-wrap gap-2">
                {cs === 'soiling_period_open' && (
                  <ActionBtn label="Schedule inspection (supervisor)" onClick={() => {
                    const method = window.prompt('Inspection method (visual / drone_ir / both):') ?? undefined;
                    void doAction('schedule-inspection', { inspection_method: method });
                  }} />
                )}
                {cs === 'inspection_scheduled' && (
                  <ActionBtn label="Record inspection (supervisor)" onClick={() => {
                    const method = window.prompt('Inspection method actually used:') ?? undefined;
                    const photo  = window.confirm('Evidence photo uploaded?');
                    void doAction('record-inspection', { inspection_method: method, evidence_photo_uploaded: photo });
                  }} />
                )}
                {cs === 'field_inspected' && (
                  <ActionBtn label="Measure soiling ratio (supervisor)" onClick={() => {
                    const ratio = window.prompt('Soiling ratio % (e.g. 5.4):') ?? undefined;
                    const base  = window.prompt('Baseline ratio % (optional):') ?? undefined;
                    const days  = window.prompt('Days since baseline (optional):') ?? undefined;
                    const prC   = window.prompt('Expected PR clean % (optional):') ?? undefined;
                    const prD   = window.prompt('Current PR dirty % (optional):') ?? undefined;
                    const psh   = window.prompt('Peak sun hours/day (optional):') ?? undefined;
                    void doAction('measure-soiling', {
                      soiling_ratio_pct: ratio ? Number(ratio) : undefined,
                      baseline_ratio_pct: base ? Number(base) : undefined,
                      days_since_baseline: days ? Number(days) : undefined,
                      expected_pr_clean_pct: prC ? Number(prC) : undefined,
                      current_pr_dirty_pct: prD ? Number(prD) : undefined,
                      peak_sun_hours_per_day: psh ? Number(psh) : undefined,
                    });
                  }} />
                )}
                {cs === 'soiling_measured' && (
                  <ActionBtn label="Assess economics (plant owner)" onClick={() => {
                    const method = window.prompt('Cleaning method (manual_wet / robotic_dry / drone_water):') ?? undefined;
                    const cost   = window.prompt('Cleaning cost (ZAR):') ?? undefined;
                    const water  = window.prompt('Water consumption (m³):') ?? undefined;
                    const horiz  = window.prompt('Recovery horizon (days):') ?? undefined;
                    const tariff = window.prompt('Tariff (ZAR/MWh, optional):') ?? undefined;
                    void doAction('assess-economics', {
                      cleaning_method: method,
                      cleaning_cost_zar: cost ? Number(cost) : undefined,
                      water_consumption_m3: water ? Number(water) : undefined,
                      recovery_horizon_days: horiz ? Number(horiz) : undefined,
                      tariff_zar_per_mwh: tariff ? Number(tariff) : undefined,
                    });
                  }} />
                )}
                {cs === 'economic_assessment_done' && (
                  <ActionBtn label="Authorize cleaning" tone="good" onClick={() => {
                    const cId    = window.prompt('Contractor ID (optional):') ?? undefined;
                    const cName  = window.prompt('Contractor name:') ?? undefined;
                    const wul    = window.prompt('DFFE WUL licence ref (optional):') ?? undefined;
                    void doAction('authorize-cleaning', {
                      cleaning_contractor_id: cId,
                      cleaning_contractor_name: cName,
                      wul_licence_ref: wul,
                    });
                  }} />
                )}
                {cs === 'cleaning_authorized' && (
                  <ActionBtn label="Start cleaning (contractor)" onClick={() => { void doAction('start-cleaning', {}); }} />
                )}
                {cs === 'cleaning_in_progress' && (
                  <ActionBtn label="Complete cleaning (contractor)" tone="good" onClick={() => {
                    const water = window.prompt('Actual water consumption (m³):') ?? undefined;
                    void doAction('complete-cleaning', { water_consumption_m3: water ? Number(water) : undefined });
                  }} />
                )}
                {cs === 'post_clean_measured' && (
                  <ActionBtn label="Measure post-clean PR (supervisor)" onClick={() => {
                    const pr = window.prompt('Post-clean PR % (e.g. 84.5):') ?? undefined;
                    void doAction('measure-post-clean', { post_clean_pr_pct: pr ? Number(pr) : undefined });
                  }} />
                )}
                {cs === 'gain_validated' && (
                  <ActionBtn label="Validate gain (plant owner)" tone="good" onClick={() => {
                    const doc = window.confirm('Recovery documented in W79 ledger?');
                    void doAction('validate-gain', { recovery_documented: doc });
                  }} />
                )}
                {cs === 'gain_validated' && (
                  <ActionBtn label="Settle audit" tone="good" onClick={() => { void doAction('settle-audit', {}); }} />
                )}
                {disputable && (
                  <ActionBtn label="Raise dispute (regulator reportable)" tone="bad" onClick={() => {
                    const reason = window.prompt('Dispute reason:') ?? undefined;
                    void doAction('raise-dispute', { disputed_reason: reason });
                  }} />
                )}
                {cs === 'disputed' && (
                  <ActionBtn label="Resolve dispute" tone="good" onClick={() => { void doAction('resolve-dispute', {}); }} />
                )}
                {cancellable && (
                  <ActionBtn label="Cancel audit" onClick={() => {
                    const reason = window.prompt('Cancellation reason:') ?? undefined;
                    void doAction('cancel-audit', { cancelled_reason: reason });
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
                        <span className="text-[#6b7685]"> · {e.from_status} → {e.to_status}</span>
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
