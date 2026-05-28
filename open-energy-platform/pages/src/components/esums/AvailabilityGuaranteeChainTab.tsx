// Wave 51 — Esums O&M Availability Guarantee & Liquidated Damages chain tab.
//
// Per-reporting-period reconciliation of contracted plant availability against
// the O&M contractor's guaranteed availability (IEC 61724/62446 + REIPPPP O&M
// service agreement). The availability counterpart to W24 PR underperformance —
// availability is time-based uptime; PR is energy-based yield.
//
//   • KPI strip: total / open / shortfall flagged / SLA breached / critical open
//     / LD assessed (ZAR) / settlement (ZAR)
//   • Filter pills by shortfall tier + chain state + SLA breach + reportable
//   • Listing with tier pill + URGENT SLA countdown (larger shortfall = tighter)
//   • Drill-down: timeline (owner/contractor party tags) + per-state actions
//
// Single-party write: Esums O&M operators record every party's action; the
// actor_party tag records whether the asset owner or the O&M contractor performed
// the contractual function. No create form — cases originate from W24 PR
// escalation / metering rollups and the operator field workflow.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'period_open' | 'measurement_submitted' | 'adjustment_review' | 'reconciled'
  | 'meets_guarantee' | 'shortfall_flagged' | 'ld_assessed' | 'cure_period'
  | 'settled' | 'disputed' | 'dispute_resolved' | 'withdrawn';

type ShortfallTier =
  | 'minor_shortfall' | 'moderate_shortfall' | 'material_shortfall'
  | 'severe_shortfall' | 'critical_shortfall';

interface GuaranteeRow {
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
  capacity_mw: number | null;
  contract_ref: string | null;
  reporting_period: string;
  period_start: string | null;
  period_end: string | null;
  guaranteed_availability_pct: number;
  bonus_threshold_pct: number | null;
  measured_availability_pct: number | null;
  excused_downtime_hours: number | null;
  adjusted_availability_pct: number | null;
  shortfall_pp: number | null;
  shortfall_tier: ShortfallTier;
  ld_rate_zar_per_pp: number | null;
  ld_cap_zar: number | null;
  ld_assessed_zar: number | null;
  bonus_zar: number | null;
  settlement_zar: number | null;
  measurement_ref: string | null;
  adjustment_ref: string | null;
  reconciliation_ref: string | null;
  ld_assessment_ref: string | null;
  cure_plan_ref: string | null;
  settlement_ref: string | null;
  dispute_ref: string | null;
  regulator_ref: string | null;
  measurement_basis: string | null;
  adjustment_basis: string | null;
  shortfall_basis: string | null;
  ld_basis: string | null;
  cure_plan: string | null;
  settlement_basis: string | null;
  dispute_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  dispute_round: number;
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

interface GuaranteeEvent {
  id: string;
  guarantee_id: string;
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
  meets_guarantee_count: number;
  shortfall_count: number;
  ld_assessed_count: number;
  cure_count: number;
  disputed_count: number;
  dispute_resolved_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  critical_open: number;
  total_capacity_mw: number;
  total_ld_assessed_zar: number;
  total_bonus_zar: number;
  total_settlement_zar: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  period_open:           { bg: '#dbecfb', fg: '#1a3a5c', label: 'Period open' },
  measurement_submitted: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Measurement submitted' },
  adjustment_review:     { bg: '#fff4d6', fg: '#a06200', label: 'Adjustment review' },
  reconciled:            { bg: '#dbecfb', fg: '#1a3a5c', label: 'Reconciled' },
  meets_guarantee:       { bg: '#daf5e2', fg: '#1f6b3a', label: 'Meets guarantee' },
  shortfall_flagged:     { bg: '#fde0e0', fg: '#9b1f1f', label: 'Shortfall flagged' },
  ld_assessed:           { bg: '#fde0e0', fg: '#9b1f1f', label: 'LD assessed' },
  cure_period:           { bg: '#fff4d6', fg: '#a06200', label: 'Cure period' },
  settled:               { bg: '#e3e7ec', fg: '#557',    label: 'Settled' },
  disputed:              { bg: '#fde0e0', fg: '#9b1f1f', label: 'Disputed' },
  dispute_resolved:      { bg: '#e3e7ec', fg: '#557',    label: 'Dispute resolved' },
  withdrawn:             { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
};

const TIER_TONE: Record<ShortfallTier, { bg: string; fg: string; label: string }> = {
  minor_shortfall:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
  moderate_shortfall: { bg: '#fff4d6', fg: '#a06200', label: 'Moderate' },
  material_shortfall: { bg: '#ffe7cc', fg: '#9a4d00', label: 'Material' },
  severe_shortfall:   { bg: '#fde0e0', fg: '#9b1f1f', label: 'Severe' },
  critical_shortfall: { bg: '#fbd0d0', fg: '#7a1414', label: 'Critical' },
};

const PARTY_TONE: Record<string, { bg: string; fg: string }> = {
  asset_owner:  { bg: '#dbecfb', fg: '#1a3a5c' },
  om_contractor:{ bg: '#fff4d6', fg: '#a06200' },
  system:       { bg: '#e3e7ec', fg: '#557' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                label: 'Active (pre-terminal)' },
  { key: 'all',                   label: 'All' },
  { key: 'critical_shortfall',    label: 'Critical' },
  { key: 'severe_shortfall',      label: 'Severe' },
  { key: 'material_shortfall',    label: 'Material' },
  { key: 'moderate_shortfall',    label: 'Moderate' },
  { key: 'minor_shortfall',       label: 'Minor' },
  { key: 'measurement_submitted', label: 'Measurement' },
  { key: 'adjustment_review',     label: 'Adjustment review' },
  { key: 'reconciled',            label: 'Reconciled' },
  { key: 'meets_guarantee',       label: 'Meets guarantee' },
  { key: 'shortfall_flagged',     label: 'Shortfall flagged' },
  { key: 'ld_assessed',           label: 'LD assessed' },
  { key: 'cure_period',           label: 'Cure period' },
  { key: 'disputed',              label: 'Disputed' },
  { key: 'settled',               label: 'Settled' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
];

function fmtZar(n: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(2)}%`;
}

function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

export function AvailabilityGuaranteeChainTab() {
  const [rows, setRows] = useState<GuaranteeRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<GuaranteeRow | null>(null);
  const [events, setEvents] = useState<GuaranteeEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: GuaranteeRow[] } }>('/availability-guarantee/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setKpis(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load availability guarantees');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: GuaranteeRow; events: GuaranteeEvent[] } }>(`/availability-guarantee/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load guarantee history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (filter.endsWith('_shortfall')) return r.shortfall_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const doAction = useCallback(async (path: string, body?: object) => {
    if (!selected) return;
    try {
      await api.post(`/availability-guarantee/chain/${selected.id}/${path}`, body ?? {});
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
        <Kpi label="Shortfall flagged" value={kpis?.shortfall_count ?? 0} tone={(kpis?.shortfall_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Critical open" value={kpis?.critical_open ?? 0} tone={(kpis?.critical_open ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="LD assessed" value={fmtZar(kpis?.total_ld_assessed_zar ?? 0)} small />
        <Kpi label="Settlement" value={fmtZar(kpis?.total_settlement_zar ?? 0)} small />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
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

      {err && <div className="px-3 py-2 bg-red-50 text-red-700 text-[12px] rounded-md">{err}</div>}

      <div className="bg-white border border-[#e5ebf2] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#f7f9fb] text-[11px] uppercase tracking-wide text-[#6b7685]">
            <tr>
              <th className="px-3 py-2 text-left">Case #</th>
              <th className="px-3 py-2 text-left">Site / period</th>
              <th className="px-3 py-2 text-left">Contractor</th>
              <th className="px-3 py-2 text-right">Guar. / Adj.</th>
              <th className="px-3 py-2 text-left">Tier</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-right">Δ SLA</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-[#6b7685]">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-[#6b7685]">No guarantees match the current filter.</td></tr>
            ) : filtered.map((r) => {
              const stateTone = STATE_TONE[r.chain_status];
              const tierTone  = TIER_TONE[r.shortfall_tier];
              return (
                <tr
                  key={r.id}
                  onClick={() => loadEvents(r.id)}
                  className={`cursor-pointer hover:bg-[#f7f9fb] border-t border-[#eef2f6] ${selected?.id === r.id ? 'bg-[#fffae6]' : ''}`}>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.case_number}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={`${r.site_name} · ${r.reporting_period}`}>
                    {r.site_name}<span className="text-[#6b7685]"> · {r.reporting_period}</span>
                  </td>
                  <td className="px-3 py-2 text-[#4a5568] max-w-[12rem] truncate" title={r.contractor_party_name}>{r.contractor_party_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[12px]">
                    {fmtPct(r.guaranteed_availability_pct)}
                    <span className="text-[#6b7685]"> / {fmtPct(r.adjusted_availability_pct)}</span>
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
        <GuaranteeDrawer
          row={selected}
          events={events}
          onClose={() => { setSelected(null); setEvents([]); }}
          doAction={doAction}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, tone = 'ok', small = false }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad'; small?: boolean }) {
  const fg = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0f1c2e';
  return (
    <div className="bg-white border border-[#e5ebf2] rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className={small ? 'text-[15px] font-semibold tabular-nums mt-0.5' : 'text-[20px] font-semibold tabular-nums mt-0.5'} style={{ color: fg }}>{value}</div>
    </div>
  );
}

function GuaranteeDrawer({
  row, events, onClose, doAction,
}: {
  row: GuaranteeRow;
  events: GuaranteeEvent[];
  onClose: () => void;
  doAction: (path: string, body?: object) => Promise<void>;
}) {
  const cs = row.chain_status;
  const transitionable = !row.is_terminal;

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
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">Guarantee {row.case_number}</div>
            <h3 className="text-[16px] font-semibold text-[#0f1c2e] mt-0.5">
              {row.site_name} · {row.reporting_period}
            </h3>
            <div className="flex flex-wrap gap-2 mt-2 text-[12px]">
              <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: TIER_TONE[row.shortfall_tier].bg, color: TIER_TONE[row.shortfall_tier].fg }}>
                {TIER_TONE[row.shortfall_tier].label}
              </span>
              <span className="px-2 py-0.5 rounded-full" style={{ background: STATE_TONE[cs].bg, color: STATE_TONE[cs].fg }}>
                {STATE_TONE[cs].label}
              </span>
              {row.is_reportable && (
                <span className="px-2 py-0.5 rounded-full bg-[#fde0e0] text-[#9b1f1f] font-medium">Regulator reportable</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-[#6b7685] hover:text-[#0f1c2e]">✕</button>
        </div>

        <div className="p-5 space-y-4 text-[13px]">
          <div className="grid grid-cols-2 gap-4">
            <Pair label="Asset owner" value={row.owner_party_name} />
            <Pair label="O&M contractor" value={row.contractor_party_name} />
            <Pair label="Technology" value={`${row.technology}${row.capacity_mw != null ? ` · ${row.capacity_mw} MW` : ''}`} />
            {row.site_province && <Pair label="Province" value={row.site_province} />}
            <Pair label="Guaranteed" value={fmtPct(row.guaranteed_availability_pct)} />
            {row.bonus_threshold_pct != null && <Pair label="Bonus threshold" value={fmtPct(row.bonus_threshold_pct)} />}
            {row.measured_availability_pct != null && <Pair label="Measured" value={fmtPct(row.measured_availability_pct)} />}
            {row.adjusted_availability_pct != null && <Pair label="Adjusted" value={fmtPct(row.adjusted_availability_pct)} />}
            {row.excused_downtime_hours != null && <Pair label="Excused downtime" value={`${row.excused_downtime_hours} h`} />}
            {row.shortfall_pp != null && <Pair label="Shortfall" value={`${row.shortfall_pp.toFixed(2)} pp`} />}
            {row.contract_ref && <Pair label="O&M contract" value={row.contract_ref} />}
          </div>

          {row.measurement_basis && <Pair label="Measurement basis" value={row.measurement_basis} />}
          {row.adjustment_basis && <Pair label="Adjustment basis" value={row.adjustment_basis} />}
          {row.shortfall_basis && <Pair label="Shortfall basis" value={row.shortfall_basis} />}
          {row.ld_basis && <Pair label="LD basis" value={row.ld_basis} />}
          {row.cure_plan && <Pair label="Cure plan" value={row.cure_plan} />}
          {row.settlement_basis && <Pair label="Settlement basis" value={row.settlement_basis} />}
          {row.dispute_basis && <Pair label="Dispute basis" value={row.dispute_basis} />}
          {row.notes && <Pair label="Notes" value={row.notes} />}

          <div className="grid grid-cols-2 gap-4">
            {row.ld_rate_zar_per_pp != null && <Pair label="LD rate / pp" value={fmtZar(row.ld_rate_zar_per_pp)} />}
            {row.ld_cap_zar != null && <Pair label="LD cap" value={fmtZar(row.ld_cap_zar)} />}
            {row.ld_assessed_zar != null && <Pair label="LD assessed" value={fmtZar(row.ld_assessed_zar)} />}
            {row.bonus_zar != null && <Pair label="Bonus" value={fmtZar(row.bonus_zar)} />}
            {row.settlement_zar != null && <Pair label="Settlement" value={fmtZar(row.settlement_zar)} />}
            {row.dispute_round > 0 && <Pair label="Dispute round" value={String(row.dispute_round)} />}
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
                {cs === 'period_open' && (
                  <ActionBtn label="Submit measurement (contractor)" onClick={() => {
                    const m = window.prompt('Measured availability (%):');
                    const ref = window.prompt('Measurement reference (optional):') ?? undefined;
                    void doAction('submit-measurement', {
                      measured_availability_pct: m != null && m !== '' ? Number(m) : undefined,
                      measurement_ref: ref,
                    });
                  }} />
                )}
                {cs === 'measurement_submitted' && (
                  <ActionBtn label="Open adjustment review" onClick={() => {
                    const h = window.prompt('Excused downtime (hours, optional):') ?? undefined;
                    const adj = window.prompt('Adjusted availability (%, optional):') ?? undefined;
                    void doAction('open-adjustment-review', {
                      excused_downtime_hours: h ? Number(h) : undefined,
                      adjusted_availability_pct: adj ? Number(adj) : undefined,
                    });
                  }} />
                )}
                {cs === 'adjustment_review' && (
                  <ActionBtn label="Reconcile" onClick={() => {
                    const adj = window.prompt('Adjusted availability (%, optional):') ?? undefined;
                    const pp = window.prompt('Shortfall (pp, optional — guaranteed minus adjusted):') ?? undefined;
                    void doAction('reconcile', {
                      adjusted_availability_pct: adj ? Number(adj) : undefined,
                      shortfall_pp: pp ? Number(pp) : undefined,
                    });
                  }} />
                )}
                {cs === 'reconciled' && (
                  <ActionBtn label="Confirm meets guarantee" tone="good" onClick={() => {
                    const b = window.prompt('Availability bonus (ZAR, optional):') ?? undefined;
                    void doAction('confirm-meets-guarantee', b ? { bonus_zar: Number(b) } : {});
                  }} />
                )}
                {cs === 'reconciled' && (
                  <ActionBtn label="Flag shortfall" tone="bad" onClick={() => {
                    const pp = window.prompt('Shortfall (pp):') ?? undefined;
                    const basis = window.prompt('Shortfall basis:') ?? undefined;
                    void doAction('flag-shortfall', { shortfall_pp: pp ? Number(pp) : undefined, shortfall_basis: basis });
                  }} />
                )}
                {cs === 'shortfall_flagged' && (
                  <ActionBtn label="Assess LD" tone="bad" onClick={() => {
                    const amt = window.prompt('Liquidated damages assessed (ZAR):') ?? undefined;
                    const basis = window.prompt('LD basis:') ?? undefined;
                    void doAction('assess-ld', { ld_assessed_zar: amt ? Number(amt) : undefined, ld_basis: basis });
                  }} />
                )}
                {cs === 'ld_assessed' && (
                  <ActionBtn label="Agree cure plan (contractor)" onClick={() => {
                    const plan = window.prompt('Cure plan:') ?? undefined;
                    void doAction('agree-cure-plan', plan ? { cure_plan: plan } : {});
                  }} />
                )}
                {(cs === 'meets_guarantee' || cs === 'ld_assessed' || cs === 'cure_period') && (
                  <ActionBtn label="Settle" tone="good" onClick={() => {
                    const amt = window.prompt('Net settlement (ZAR, optional):') ?? undefined;
                    const basis = window.prompt('Settlement basis (optional):') ?? undefined;
                    void doAction('settle', { settlement_zar: amt ? Number(amt) : undefined, settlement_basis: basis });
                  }} />
                )}
                {(cs === 'ld_assessed' || cs === 'cure_period') && (
                  <ActionBtn label="Waive LD" onClick={() => {
                    const basis = window.prompt('Waiver basis:') ?? undefined;
                    const rc = window.prompt('Reason code (optional):') ?? undefined;
                    void doAction('waive-ld', { settlement_basis: basis, reason_code: rc });
                  }} />
                )}
                {(cs === 'shortfall_flagged' || cs === 'ld_assessed' || cs === 'cure_period') && (
                  <ActionBtn label="Raise dispute (contractor)" tone="bad" onClick={() => {
                    const basis = window.prompt('Dispute basis:') ?? undefined;
                    void doAction('raise-dispute', basis ? { dispute_basis: basis } : {});
                  }} />
                )}
                {cs === 'disputed' && (
                  <ActionBtn label="Resolve dispute" onClick={() => {
                    const basis = window.prompt('Resolution basis:') ?? undefined;
                    const amt = window.prompt('Settlement after resolution (ZAR, optional):') ?? undefined;
                    void doAction('resolve-dispute', { dispute_basis: basis, settlement_zar: amt ? Number(amt) : undefined });
                  }} />
                )}
                {(cs === 'period_open' || cs === 'measurement_submitted' || cs === 'adjustment_review') && (
                  <ActionBtn label="Withdraw" onClick={() => {
                    const rc = window.prompt('Reason code (optional):') ?? undefined;
                    void doAction('withdraw', rc ? { reason_code: rc } : {});
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
    <button onClick={onClick} className={`px-3 py-1.5 ${bg} text-white text-[12px] rounded-md hover:opacity-90`}>
      {label}
    </button>
  );
}
