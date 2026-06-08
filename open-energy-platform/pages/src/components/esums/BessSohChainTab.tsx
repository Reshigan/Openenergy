// Wave 88 — Esums BESS State-of-Health Monitoring & Capacity-Augmentation tab.
//
// Every grid-connected BESS carries a contractual capacity guarantee — typically a
// state-of-health floor (e.g. >= 70% nameplate after 10 years). Capacity fades
// through calendar + cycle ageing. Once the SOH dips below the contracted floor
// the operator owes either an AUGMENTATION (install fresh modules) or a financial
// make-good. W88 puts the whole lifecycle on a 12-state P6 chain with a live
// health + economics battery, auto-derived tier, urgency-band SLA and a regulator
// hard line on augmentation / decommission for grid-connected >= 50 MW BESS
// (NERSA Grid Code security-of-supply).
//
//   • KPI strip: total / open / dispute / SLA breached / >=50 MW / reportable /
//     augmentation NPV ZAR
//   • Filter pills by tier + chain state + dispute + SLA breach + reportable
//   • Listing with tier pill + SOH vs floor + URGENT SLA countdown + shortfall MWh
//   • Drill-down: the live health + economics battery (SOH headroom %, fade rate,
//     EFC, cycle attribution, shortfall MWh, augmentation CapEx, capacity-payment
//     at risk, augmentation NPV, warranty eligibility, predicted decommission
//     years), party-tagged timeline + per-state actions
//
// Single-party write: the Esums asset-health desk operates the chain; actor_party
// records operator / oem / owner / regulator per step.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'baseline_set' | 'monitoring_active' | 'drift_detected' | 'assessment_pending'
  | 'augmentation_required' | 'augmentation_planned' | 'augmentation_in_progress'
  | 'augmentation_complete' | 'recommissioned' | 'disputed'
  | 'decommissioned' | 'cancelled';

type Tier = 'nominal' | 'watch' | 'material' | 'critical';
type Urgency = 'critical' | 'high' | 'medium' | 'low';

interface BsohRow {
  id: string;
  programme_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  bess_id: string;
  bess_reference: string;
  site_id: string;
  site_name: string;
  owner_id: string;
  owner_name: string;
  operator_id: string;
  operator_name: string;
  oem_id: string | null;
  oem_name: string | null;
  installed_capacity_mw: number;
  nameplate_energy_mwh: number;
  duration_hours: number;
  chemistry: string | null;
  commissioning_date: string;
  years_in_service: number;
  baseline_soh_pct: number;
  current_soh_pct: number;
  contractual_floor_pct: number;
  end_of_life_threshold_pct: number;
  warranty_end_date: string | null;
  warranty_years_remaining: number;
  total_throughput_mwh: number;
  equivalent_full_cycles: number;
  cycle_fade_attribution_pct: number;
  annualised_fade_rate_pct: number;
  capacity_shortfall_mwh: number;
  augmentation_capex_zar: number;
  capacity_payment_at_risk_zar: number;
  augmentation_npv_zar: number;
  augmentation_works_ref: string | null;
  augmentation_completed_mwh: number | null;
  dispute_ground: string | null;
  dispute_resolution_ref: string | null;
  warranty_recovery_eligible: number;
  warranty_recovery_amount_zar: number | null;
  soh_tier: Tier;
  programme_basis: string | null;
  reason_code: string | null;
  programme_summary: string | null;
  chain_status: ChainStatus;
  sla_deadline_at: string | null;
  escalation_level: number;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  soh_headroom_pct_live?: number;
  annualised_fade_rate_pct_live?: number;
  equivalent_full_cycles_live?: number;
  cycle_fade_attribution_pct_live?: number;
  capacity_shortfall_mwh_live?: number;
  augmentation_capex_zar_live?: number;
  capacity_payment_at_risk_zar_live?: number;
  augmentation_npv_zar_live?: number;
  warranty_recovery_eligible_live?: boolean;
  predicted_decommission_years_live?: number;
  sla_days_remaining_live?: number;
  urgency_band_live?: Urgency;
  created_at: string;
}

interface BsohEvent {
  id: string;
  programme_id: string;
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
  monitoring_count: number;
  drift_count: number;
  assessment_count: number;
  augmentation_required_count: number;
  augmentation_planned_count: number;
  augmentation_in_progress_count: number;
  augmentation_complete_count: number;
  recommissioned_count: number;
  disputed_count: number;
  decommissioned_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  total_installed_capacity_mw: number;
  total_nameplate_energy_mwh: number;
  total_capacity_shortfall_mwh: number;
  total_augmentation_capex_zar: number;
  total_capacity_at_risk_zar: number;
  total_augmentation_npv_zar: number;
  warranty_eligible_count: number;
  critical_urgency_count: number;
  critical_tier_count: number;
  material_tier_count: number;
  ge_50mw_count: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  baseline_set:             { bg: '#dbecfb', fg: '#1a3a5c', label: 'Baseline set' },
  monitoring_active:        { bg: '#daf5e2', fg: '#1f6b3a', label: 'Monitoring' },
  drift_detected:           { bg: '#fff4d6', fg: '#a06200', label: 'Drift detected' },
  assessment_pending:       { bg: '#fff4d6', fg: '#a06200', label: 'Assessment pending' },
  augmentation_required:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Augmentation required' },
  augmentation_planned:     { bg: '#fff4d6', fg: '#a06200', label: 'Augmentation planned' },
  augmentation_in_progress: { bg: '#fff4d6', fg: '#a06200', label: 'Works in progress' },
  augmentation_complete:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Works complete' },
  recommissioned:           { bg: '#daf5e2', fg: '#1f6b3a', label: 'Recommissioned' },
  disputed:                 { bg: '#fde0e0', fg: '#9b1f1f', label: 'Disputed' },
  decommissioned:           { bg: '#fbd0d0', fg: '#7a1414', label: 'Decommissioned' },
  cancelled:                { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  nominal:  { bg: '#daf5e2', fg: '#1f6b3a', label: 'Nominal' },
  watch:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Watch' },
  material: { bg: '#fff4d6', fg: '#a06200', label: 'Material' },
  critical: { bg: '#fbd0d0', fg: '#7a1414', label: 'Critical' },
};

const URGENCY_TONE: Record<Urgency, { bg: string; fg: string; label: string }> = {
  low:      { bg: '#daf5e2', fg: '#1f6b3a', label: 'Low' },
  medium:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Medium' },
  high:     { bg: '#fff4d6', fg: '#a06200', label: 'High' },
  critical: { bg: '#fbd0d0', fg: '#7a1414', label: 'Critical' },
};

const PARTY_TONE: Record<string, { bg: string; fg: string }> = {
  operator:  { bg: '#dbecfb', fg: '#1a3a5c' },
  oem:       { bg: '#fff4d6', fg: '#a06200' },
  owner:     { bg: '#daf5e2', fg: '#1f6b3a' },
  regulator: { bg: '#fde0e0', fg: '#9b1f1f' },
  system:    { bg: '#e3e7ec', fg: '#557' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                   label: 'Active (pre-terminal)' },
  { key: 'all',                      label: 'All' },
  { key: 'critical',                 label: 'Critical' },
  { key: 'material',                 label: 'Material' },
  { key: 'watch',                    label: 'Watch' },
  { key: 'nominal',                  label: 'Nominal' },
  { key: 'monitoring_active',        label: 'Monitoring' },
  { key: 'drift_detected',           label: 'Drift' },
  { key: 'assessment_pending',       label: 'Assessment' },
  { key: 'augmentation_required',    label: 'Aug required' },
  { key: 'augmentation_planned',     label: 'Aug planned' },
  { key: 'augmentation_in_progress', label: 'Works' },
  { key: 'augmentation_complete',    label: 'Works done' },
  { key: 'recommissioned',           label: 'Recommissioned' },
  { key: 'disputed',                 label: 'Disputed' },
  { key: 'decommissioned',           label: 'Decommissioned' },
  { key: 'breached',                 label: 'SLA breached' },
  { key: 'reportable',               label: 'Reportable' },
];

const TIERS = new Set<string>(['nominal', 'watch', 'material', 'critical']);

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

function fmtMwh(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} MWh`;
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${v.toFixed(1)}%`;
}

export function BessSohChainTab() {
  const [rows, setRows] = useState<BsohRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<BsohRow | null>(null);
  const [events, setEvents] = useState<BsohEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: BsohRow[] } }>('/bess-soh/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setKpis(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load BESS SOH programmes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: BsohRow; events: BsohEvent[] } }>(`/bess-soh/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load programme history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable_flag;
      if (TIERS.has(filter))       return r.soh_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const doAction = useCallback(async (path: string, body?: object) => {
    if (!selected) return;
    try {
      await api.post(`/bess-soh/chain/${selected.id}/${path}`, body ?? {});
      await load();
      await loadEvents(selected.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [selected, load, loadEvents]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-3">
        <Kpi label="Total" value={kpis?.total ?? 0} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Disputed" value={kpis?.disputed_count ?? 0} tone={(kpis?.disputed_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="≥50 MW (NERSA)" value={kpis?.ge_50mw_count ?? 0} tone={(kpis?.ge_50mw_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Aug NPV" value={fmtZar(kpis?.total_augmentation_npv_zar ?? 0)} tone={(kpis?.total_augmentation_npv_zar ?? 0) >= 0 ? 'ok' : 'bad'} />
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
              <th className="px-3 py-2 text-left">Programme #</th>
              <th className="px-3 py-2 text-left">Site / capacity</th>
              <th className="px-3 py-2 text-right">SOH vs floor</th>
              <th className="px-3 py-2 text-right">Shortfall</th>
              <th className="px-3 py-2 text-left">Tier</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-right">Δ SLA</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-[#6b7685]">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-[#6b7685]">No SOH programmes match the current filter.</td></tr>
            ) : filtered.map((r) => {
              const stateTone = STATE_TONE[r.chain_status];
              const tierTone  = TIER_TONE[r.soh_tier];
              const headroom = r.soh_headroom_pct_live ?? (r.current_soh_pct - r.contractual_floor_pct);
              return (
                <tr
                  key={r.id}
                  onClick={() => loadEvents(r.id)}
                  className={`cursor-pointer hover:bg-[#f7f9fb] border-t border-[#eef2f6] ${selected?.id === r.id ? 'bg-[#fffae6]' : ''}`}>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.programme_number}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={`${r.site_name} · ${r.installed_capacity_mw} MW / ${r.nameplate_energy_mwh} MWh`}>
                    {r.site_name}<span className="text-[#6b7685]"> · {r.installed_capacity_mw} MW / {r.nameplate_energy_mwh} MWh</span>
                    {r.installed_capacity_mw >= 50 && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#fff4d6] text-[#a06200]">≥50MW</span>}
                  </td>
                  <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${headroom < 0 ? 'text-[#9b1f1f] font-semibold' : 'text-[#4a5568]'}`}>
                    {fmtPct(r.current_soh_pct)} <span className="text-[#6b7685]">/ {fmtPct(r.contractual_floor_pct)}</span>
                  </td>
                  <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${(r.capacity_shortfall_mwh_live ?? 0) > 0 ? 'text-[#9b1f1f]' : 'text-[#4a5568]'}`}>
                    {fmtMwh(r.capacity_shortfall_mwh_live)}
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
        <BsohDrawer
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

function BsohDrawer({
  row, events, onClose, doAction,
}: {
  row: BsohRow;
  events: BsohEvent[];
  onClose: () => void;
  doAction: (path: string, body?: object) => Promise<void>;
}) {
  const cs = row.chain_status;
  const transitionable = !row.is_terminal;
  const cancellable = cs === 'baseline_set';
  const disputable = ['drift_detected', 'assessment_pending', 'augmentation_required'].includes(cs);
  const decommissionable = ['monitoring_active', 'drift_detected', 'assessment_pending', 'augmentation_required', 'augmentation_planned', 'augmentation_in_progress', 'augmentation_complete', 'disputed'].includes(cs);

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
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">Programme {row.programme_number}</div>
            <h3 className="text-[16px] font-semibold text-[#0f1c2e] mt-0.5">
              {row.site_name} · {row.installed_capacity_mw} MW / {row.nameplate_energy_mwh} MWh
            </h3>
            <div className="flex flex-wrap gap-2 mt-2 text-[12px]">
              <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: TIER_TONE[row.soh_tier].bg, color: TIER_TONE[row.soh_tier].fg }}>
                {TIER_TONE[row.soh_tier].label}
              </span>
              <span className="px-2 py-0.5 rounded-full" style={{ background: STATE_TONE[cs].bg, color: STATE_TONE[cs].fg }}>
                {STATE_TONE[cs].label}
              </span>
              {row.urgency_band_live && (
                <span className="px-2 py-0.5 rounded-full" style={{ background: URGENCY_TONE[row.urgency_band_live].bg, color: URGENCY_TONE[row.urgency_band_live].fg }}>
                  Urgency: {URGENCY_TONE[row.urgency_band_live].label}
                </span>
              )}
              {row.installed_capacity_mw >= 50 && (
                <span className="px-2 py-0.5 rounded-full bg-[#fff4d6] text-[#a06200] font-bold">NERSA ≥50 MW</span>
              )}
              {row.is_reportable_flag && (
                <span className="px-2 py-0.5 rounded-full bg-[#fde0e0] text-[#9b1f1f] font-medium">Regulator reportable</span>
              )}
              {row.warranty_recovery_eligible_live && (
                <span className="px-2 py-0.5 rounded-full bg-[#daf5e2] text-[#1f6b3a] font-medium">Warranty eligible</span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[#6b7685] hover:text-[#0f1c2e]">✕</button>
        </div>

        <div className="p-5 space-y-4 text-[13px]">
          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">SOH window</div>
            <div className="grid grid-cols-4 gap-3">
              <Pair label="Baseline" value={fmtPct(row.baseline_soh_pct)} />
              <Pair label="Current SOH" value={fmtPct(row.current_soh_pct)} />
              <Pair label="Contracted floor" value={fmtPct(row.contractual_floor_pct)} />
              <Pair label="Headroom" value={fmtPct(row.soh_headroom_pct_live)} />
            </div>
            <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Fade rate" value={`${(row.annualised_fade_rate_pct_live ?? 0).toFixed(2)} %/yr`} />
              <Pair label="EFC" value={(row.equivalent_full_cycles_live ?? 0).toFixed(1)} />
              <Pair label="Cycle attribution" value={fmtPct(row.cycle_fade_attribution_pct_live)} />
              <Pair label="Predicted EoL" value={`${(row.predicted_decommission_years_live ?? 0).toFixed(1)} yr`} />
            </div>
          </div>

          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Augmentation economics</div>
            <div className="grid grid-cols-4 gap-3">
              <Pair label="Shortfall" value={fmtMwh(row.capacity_shortfall_mwh_live)} />
              <Pair label="Augmentation CapEx" value={fmtZar(row.augmentation_capex_zar_live)} />
              <Pair label="Capacity payment at risk / yr" value={fmtZar(row.capacity_payment_at_risk_zar_live)} />
              <Pair label="Augmentation NPV" value={fmtZar(row.augmentation_npv_zar_live)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Pair label="Owner" value={row.owner_name} />
            <Pair label="Operator" value={row.operator_name} />
            {row.oem_name && <Pair label="OEM" value={row.oem_name} />}
            <Pair label="Commissioning" value={row.commissioning_date} />
            <Pair label="Years in service" value={row.years_in_service.toFixed(1)} />
            {row.chemistry && <Pair label="Chemistry" value={row.chemistry} />}
            {row.warranty_end_date && <Pair label="Warranty end" value={row.warranty_end_date} />}
            <Pair label="Duration" value={`${row.duration_hours} hr`} />
            {row.augmentation_works_ref && <Pair label="Works ref" value={row.augmentation_works_ref} />}
            {row.augmentation_completed_mwh != null && <Pair label="Completed MWh" value={fmtMwh(row.augmentation_completed_mwh)} />}
            {row.dispute_ground && <Pair label="Dispute ground" value={row.dispute_ground} />}
            {row.dispute_resolution_ref && <Pair label="Dispute resolution" value={row.dispute_resolution_ref} />}
            {row.reason_code && <Pair label="Reason code" value={row.reason_code} />}
          </div>

          {row.programme_basis && <Pair label="Programme basis" value={row.programme_basis} />}
          {row.programme_summary && <Pair label="Programme summary" value={row.programme_summary} />}

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
                {cs === 'baseline_set' && (
                  <ActionBtn label="Activate monitoring (operator)" tone="good" onClick={() => {
                    const soh = window.prompt('Current SOH % (defaults to baseline):') ?? undefined;
                    const tp = window.prompt('Total throughput MWh (optional):') ?? undefined;
                    const basis = window.prompt('Programme basis (optional):') ?? undefined;
                    void doAction('activate-monitoring', {
                      current_soh_pct: soh ? Number(soh) : undefined,
                      total_throughput_mwh: tp ? Number(tp) : undefined,
                      programme_basis: basis,
                    });
                  }} />
                )}
                {cs === 'monitoring_active' && (
                  <ActionBtn label="Detect drift (operator)" tone="bad" onClick={() => {
                    const soh = window.prompt('Current SOH % (drift reading):') ?? undefined;
                    const tp = window.prompt('Total throughput MWh (optional):') ?? undefined;
                    const basis = window.prompt('Drift basis (e.g. cycle fade vs contractual curve):') ?? undefined;
                    void doAction('detect-drift', {
                      current_soh_pct: soh ? Number(soh) : undefined,
                      total_throughput_mwh: tp ? Number(tp) : undefined,
                      programme_basis: basis,
                    });
                  }} />
                )}
                {(cs === 'drift_detected' || cs === 'disputed') && (
                  <ActionBtn label="Assess cause (operator)" onClick={() => {
                    const soh = window.prompt('Current SOH % (optional):') ?? undefined;
                    const cyc = window.prompt('Cycle attribution % (e.g. 65 if cycle-dominated):') ?? undefined;
                    const basis = window.prompt('Assessment basis (cycle / calendar / cell-imbalance / thermal):') ?? undefined;
                    void doAction('assess-cause', {
                      current_soh_pct: soh ? Number(soh) : undefined,
                      cycle_fade_attribution_pct: cyc ? Number(cyc) : undefined,
                      programme_basis: basis,
                    });
                  }} />
                )}
                {cs === 'assessment_pending' && (
                  <ActionBtn label="Require augmentation (operator)" tone="bad" onClick={() => {
                    const soh = window.prompt('Confirmed SOH % (drives tier):') ?? undefined;
                    const capex = window.prompt('Augmentation CapEx per kWh ZAR (default 6500):') ?? undefined;
                    const rate = window.prompt('Capacity rate ZAR / MW-yr (default 1,200,000):') ?? undefined;
                    const warr = window.prompt('Residual warranty years (optional):') ?? undefined;
                    const dr = window.prompt('Discount rate % (default 12):') ?? undefined;
                    void doAction('require-augmentation', {
                      current_soh_pct: soh ? Number(soh) : undefined,
                      augmentation_capex_per_kwh: capex ? Number(capex) : undefined,
                      capacity_rate_per_mw_year: rate ? Number(rate) : undefined,
                      residual_warranty_years: warr ? Number(warr) : undefined,
                      discount_rate_pct: dr ? Number(dr) : undefined,
                    });
                  }} />
                )}
                {cs === 'augmentation_required' && (
                  <ActionBtn label="Plan augmentation (owner)" onClick={() => {
                    const ref = window.prompt('Augmentation works reference:') ?? undefined;
                    const cap = window.prompt('Augmentation CapEx per kWh ZAR (optional override):') ?? undefined;
                    void doAction('plan-augmentation', {
                      augmentation_works_ref: ref,
                      augmentation_capex_per_kwh: cap ? Number(cap) : undefined,
                    });
                  }} />
                )}
                {cs === 'augmentation_planned' && (
                  <ActionBtn label="Start works (OEM)" onClick={() => {
                    const ref = window.prompt('Works mobilisation reference (optional):') ?? undefined;
                    void doAction('start-works', { augmentation_works_ref: ref });
                  }} />
                )}
                {cs === 'augmentation_in_progress' && (
                  <ActionBtn label="Complete works (OEM)" tone="good" onClick={() => {
                    const mwh = window.prompt('Augmentation completed MWh:') ?? undefined;
                    const soh = window.prompt('Post-works SOH %:') ?? undefined;
                    void doAction('complete-works', {
                      augmentation_completed_mwh: mwh ? Number(mwh) : undefined,
                      current_soh_pct: soh ? Number(soh) : undefined,
                    });
                  }} />
                )}
                {cs === 'augmentation_complete' && (
                  <ActionBtn label="Recommission (owner)" tone="good" onClick={() => {
                    const soh = window.prompt('Final SOH % at recommissioning:') ?? undefined;
                    void doAction('recommission', { current_soh_pct: soh ? Number(soh) : undefined });
                  }} />
                )}
                {disputable && (
                  <ActionBtn label="Raise SOH dispute (owner)" tone="bad" onClick={() => {
                    const ground = window.prompt('Dispute ground (methodology / measurement / curve):') ?? undefined;
                    void doAction('raise-dispute', { dispute_ground: ground });
                  }} />
                )}
                {cs === 'disputed' && (
                  <ActionBtn label="Resolve dispute (operator)" onClick={() => {
                    const ref = window.prompt('Dispute resolution reference:') ?? undefined;
                    const soh = window.prompt('Agreed SOH % post-resolution (optional):') ?? undefined;
                    void doAction('resolve-dispute', {
                      dispute_resolution_ref: ref,
                      current_soh_pct: soh ? Number(soh) : undefined,
                    });
                  }} />
                )}
                {decommissionable && (
                  <ActionBtn label="Decommission (owner)" tone="bad" onClick={() => {
                    const soh = window.prompt('Final SOH % at decommissioning:') ?? undefined;
                    void doAction('decommission', { current_soh_pct: soh ? Number(soh) : undefined });
                  }} />
                )}
                {cancellable && (
                  <ActionBtn label="Cancel programme (opened in error)" onClick={() => {
                    const rc = window.prompt('Reason code (optional):') ?? undefined;
                    void doAction('cancel-programme', { reason_code: rc });
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

function ActionBtn({ label, onClick, tone = 'neutral' }: { label: string; onClick: () => void; tone?: 'neutral' | 'good' | 'bad' }) {
  const bg = tone === 'good' ? 'bg-emerald-700' : tone === 'bad' ? 'bg-red-700' : 'bg-[#1a3a5c]';
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 ${bg} text-white text-[12px] rounded-md hover:opacity-90`}>
      {label}
    </button>
  );
}
