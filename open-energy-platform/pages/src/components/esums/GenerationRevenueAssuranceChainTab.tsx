// Wave 79 — Esums Generation Revenue Assurance & Meter Reconciliation tab.
//
// Every MWh a plant generates should turn into cash. Between the inverter and the
// bank account sit four numbers that should agree but rarely do: EXPECTED generation
// (W71 prognostics / W24 PR model), the REVENUE METER reading, the SETTLEMENT
// statement and the PPA INVOICE. Where they diverge, money leaks. W79 reconciles all
// four against the expected-generation baseline, auto-classifies the leakage
// signature, and closes the loop to an SLA-driven recovery with a NERSA-visible
// settlement-dispute branch and a quantified recovered-ZAR ledger.
//
//   • KPI strip: total / open / in-dispute / SLA breached / large open / reportable /
//     recovered ZAR
//   • Filter pills by variance tier + chain state + leakage category + SLA breach +
//     reportable
//   • Listing with tier pill + leakage-category tag + URGENT SLA countdown + ZAR variance
//   • Drill-down: the four numbers, variance, timeline (analyst / counterparty /
//     reviewer party tags) + per-state actions (ingest → reconcile → flag → investigate
//     → classify → recover / dispute / write-off / close-clean)
//
// Single-party write: the Esums revenue-assurance desk operates the chain; the
// actor_party tag records whether the analyst prosecuted, the counterparty credited,
// or a reviewer signed off. No create form — recon periods open against a live meter.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'period_open' | 'data_ingested' | 'reconciled' | 'variance_flagged'
  | 'investigating' | 'classified' | 'recovery_pending' | 'in_dispute'
  | 'recovered' | 'closed_clean' | 'written_off' | 'cancelled';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';

type LeakageCategory =
  | 'meter_drift' | 'comms_gap' | 'settlement_error'
  | 'curtailment_shortfall' | 'clipping_loss' | 'meter_tampering';

interface AssuranceRow {
  id: string;
  gra_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  site_id: string | null;
  project_id: string | null;
  meter_id: string | null;
  ppa_ref: string | null;
  reconciliation_period: string;
  period_start: string | null;
  period_end: string | null;
  data_cutoff_date: string | null;
  site_name: string;
  operator_name: string;
  counterparty_name: string | null;
  reviewer_name: string | null;
  expected_generation_mwh: number | null;
  metered_generation_mwh: number | null;
  settled_generation_mwh: number | null;
  invoiced_generation_mwh: number | null;
  currency: string | null;
  tariff_ref: string | null;
  expected_revenue_zar: number | null;
  settled_revenue_zar: number | null;
  variance_zar: number;
  variance_mwh: number | null;
  recovered_zar: number | null;
  written_off_zar: number | null;
  leakage_category: LeakageCategory | null;
  recovery_method: string | null;
  revenue_assurance_tier: Tier;
  reason_code: string | null;
  recovery_deadline: string | null;
  dispute_deadline: string | null;
  ingest_ref: string | null;
  reconciliation_ref: string | null;
  investigation_ref: string | null;
  classification_ref: string | null;
  recovery_ref: string | null;
  dispute_ref: string | null;
  resolution_ref: string | null;
  writeoff_ref: string | null;
  cancellation_ref: string | null;
  period_basis: string | null;
  ingest_basis: string | null;
  reconciliation_basis: string | null;
  investigation_basis: string | null;
  classification_basis: string | null;
  recovery_basis: string | null;
  dispute_basis: string | null;
  resolution_basis: string | null;
  writeoff_basis: string | null;
  cancellation_basis: string | null;
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

interface AssuranceEvent {
  id: string;
  assurance_id: string;
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
  dispute_count: number;
  recovered_count: number;
  closed_clean_count: number;
  written_off_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  large_open: number;
  total_variance_zar: number;
  recovered_zar_total: number;
  written_off_zar_total: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  period_open:      { bg: '#dbecfb', fg: '#1a3a5c', label: 'Period open' },
  data_ingested:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Data ingested' },
  reconciled:       { bg: '#daf5e2', fg: '#1f6b3a', label: 'Reconciled' },
  variance_flagged: { bg: '#fff4d6', fg: '#a06200', label: 'Variance flagged' },
  investigating:    { bg: '#fff4d6', fg: '#a06200', label: 'Investigating' },
  classified:       { bg: '#fff4d6', fg: '#a06200', label: 'Classified' },
  recovery_pending: { bg: '#fff4d6', fg: '#a06200', label: 'Recovery pending' },
  in_dispute:       { bg: '#fde0e0', fg: '#9b1f1f', label: 'In dispute' },
  recovered:        { bg: '#daf5e2', fg: '#1f6b3a', label: 'Recovered' },
  closed_clean:     { bg: '#e3e7ec', fg: '#557',    label: 'Closed clean' },
  written_off:      { bg: '#fbd0d0', fg: '#7a1414', label: 'Written off' },
  cancelled:        { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
  moderate: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate' },
  material: { bg: '#fff4d6', fg: '#a06200', label: 'Material' },
  major:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Major' },
  critical: { bg: '#fbd0d0', fg: '#7a1414', label: 'Critical' },
};

const CATEGORY_LABEL: Record<LeakageCategory, string> = {
  meter_drift:           'Meter drift',
  comms_gap:             'Comms gap',
  settlement_error:      'Settlement error',
  curtailment_shortfall: 'Curtailment shortfall',
  clipping_loss:         'Clipping loss',
  meter_tampering:       'Meter tampering',
};

const PARTY_TONE: Record<string, { bg: string; fg: string }> = {
  analyst:      { bg: '#dbecfb', fg: '#1a3a5c' },
  counterparty: { bg: '#fff4d6', fg: '#a06200' },
  reviewer:     { bg: '#daf5e2', fg: '#1f6b3a' },
  system:       { bg: '#e3e7ec', fg: '#557' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',           label: 'Active (pre-terminal)' },
  { key: 'all',              label: 'All' },
  { key: 'critical',         label: 'Critical' },
  { key: 'major',            label: 'Major' },
  { key: 'material',         label: 'Material' },
  { key: 'moderate',         label: 'Moderate' },
  { key: 'minor',            label: 'Minor' },
  { key: 'variance_flagged', label: 'Variance flagged' },
  { key: 'investigating',    label: 'Investigating' },
  { key: 'classified',       label: 'Classified' },
  { key: 'recovery_pending', label: 'Recovery pending' },
  { key: 'in_dispute',       label: 'In dispute' },
  { key: 'recovered',        label: 'Recovered' },
  { key: 'closed_clean',     label: 'Closed clean' },
  { key: 'written_off',      label: 'Written off' },
  { key: 'meter_tampering',  label: 'Tampering' },
  { key: 'breached',         label: 'SLA breached' },
  { key: 'reportable',       label: 'Reportable' },
];

const TIERS = new Set<string>(['minor', 'moderate', 'material', 'major', 'critical']);
const CATS = new Set<string>(['meter_drift', 'comms_gap', 'settlement_error', 'curtailment_shortfall', 'clipping_loss', 'meter_tampering']);

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

export function GenerationRevenueAssuranceChainTab() {
  const [rows, setRows] = useState<AssuranceRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<AssuranceRow | null>(null);
  const [events, setEvents] = useState<AssuranceEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: AssuranceRow[] } }>('/generation-revenue-assurance/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setKpis(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load recon periods');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: AssuranceRow; events: AssuranceEvent[] } }>(`/generation-revenue-assurance/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load recon history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (TIERS.has(filter))       return r.revenue_assurance_tier === filter;
      if (CATS.has(filter))        return r.leakage_category === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const doAction = useCallback(async (path: string, body?: object) => {
    if (!selected) return;
    try {
      await api.post(`/generation-revenue-assurance/chain/${selected.id}/${path}`, body ?? {});
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
        <Kpi label="In dispute" value={kpis?.dispute_count ?? 0} tone={(kpis?.dispute_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Large open" value={kpis?.large_open ?? 0} tone={(kpis?.large_open ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Recovered" value={fmtZar(kpis?.recovered_zar_total ?? 0)} tone="ok" />
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
              <th className="px-3 py-2 text-left">GRA #</th>
              <th className="px-3 py-2 text-left">Site / period</th>
              <th className="px-3 py-2 text-left">Leakage</th>
              <th className="px-3 py-2 text-right">Variance</th>
              <th className="px-3 py-2 text-left">Tier</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-right">Δ SLA</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-[#6b7685]">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-[#6b7685]">No recon periods match the current filter.</td></tr>
            ) : filtered.map((r) => {
              const stateTone = STATE_TONE[r.chain_status];
              const tierTone  = TIER_TONE[r.revenue_assurance_tier];
              return (
                <tr
                  key={r.id}
                  onClick={() => loadEvents(r.id)}
                  className={`cursor-pointer hover:bg-[#f7f9fb] border-t border-[#eef2f6] ${selected?.id === r.id ? 'bg-[#fffae6]' : ''}`}>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.gra_number}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={`${r.site_name} · ${r.reconciliation_period}`}>
                    {r.site_name}<span className="text-[#6b7685]"> · {r.reconciliation_period}</span>
                  </td>
                  <td className="px-3 py-2 text-[#4a5568] text-[12px] max-w-[11rem] truncate">
                    {r.leakage_category ? CATEGORY_LABEL[r.leakage_category] : '—'}
                    {r.leakage_category === 'meter_tampering' && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#fbd0d0] text-[#7a1414]">TAMPER</span>}
                  </td>
                  <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${r.variance_zar < 0 ? 'text-[#9b1f1f]' : 'text-[#4a5568]'}`}>
                    {fmtZar(r.variance_zar)}
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
        <AssuranceDrawer
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

function AssuranceDrawer({
  row, events, onClose, doAction,
}: {
  row: AssuranceRow;
  events: AssuranceEvent[];
  onClose: () => void;
  doAction: (path: string, body?: object) => Promise<void>;
}) {
  const cs = row.chain_status;
  const transitionable = !row.is_terminal;
  const cancellable = ['period_open', 'data_ingested', 'reconciled', 'variance_flagged', 'investigating', 'classified'].includes(cs);

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
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">Recon {row.gra_number}</div>
            <h3 className="text-[16px] font-semibold text-[#0f1c2e] mt-0.5">
              {row.site_name} · {row.reconciliation_period}
            </h3>
            <div className="flex flex-wrap gap-2 mt-2 text-[12px]">
              <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: TIER_TONE[row.revenue_assurance_tier].bg, color: TIER_TONE[row.revenue_assurance_tier].fg }}>
                {TIER_TONE[row.revenue_assurance_tier].label}
              </span>
              <span className="px-2 py-0.5 rounded-full" style={{ background: STATE_TONE[cs].bg, color: STATE_TONE[cs].fg }}>
                {STATE_TONE[cs].label}
              </span>
              {row.leakage_category === 'meter_tampering' && (
                <span className="px-2 py-0.5 rounded-full bg-[#fbd0d0] text-[#7a1414] font-bold">METER TAMPERING</span>
              )}
              {row.is_reportable && (
                <span className="px-2 py-0.5 rounded-full bg-[#fde0e0] text-[#9b1f1f] font-medium">Regulator reportable</span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[#6b7685] hover:text-[#0f1c2e]">✕</button>
        </div>

        <div className="p-5 space-y-4 text-[13px]">
          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">The four numbers (generation)</div>
            <div className="grid grid-cols-4 gap-3">
              <Pair label="Expected" value={fmtMwh(row.expected_generation_mwh)} />
              <Pair label="Metered" value={fmtMwh(row.metered_generation_mwh)} />
              <Pair label="Settled" value={fmtMwh(row.settled_generation_mwh)} />
              <Pair label="Invoiced" value={fmtMwh(row.invoiced_generation_mwh)} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Expected revenue" value={fmtZar(row.expected_revenue_zar)} />
              <Pair label="Settled revenue" value={fmtZar(row.settled_revenue_zar)} />
              <Pair label="Variance" value={`${fmtZar(row.variance_zar)}${row.variance_mwh != null ? ` · ${fmtMwh(row.variance_mwh)}` : ''}`} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Pair label="Operator" value={row.operator_name} />
            {row.counterparty_name && <Pair label="Counterparty (recovery target)" value={row.counterparty_name} />}
            {row.reviewer_name && <Pair label="Reviewer" value={row.reviewer_name} />}
            {row.meter_id && <Pair label="Revenue meter" value={row.meter_id} />}
            {row.ppa_ref && <Pair label="PPA ref" value={row.ppa_ref} />}
            {row.tariff_ref && <Pair label="Tariff ref" value={row.tariff_ref} />}
            {row.leakage_category && <Pair label="Leakage category" value={CATEGORY_LABEL[row.leakage_category]} />}
            {row.recovery_method && <Pair label="Recovery method" value={row.recovery_method} />}
            {row.recovered_zar != null && row.recovered_zar > 0 && <Pair label="Recovered" value={fmtZar(row.recovered_zar)} />}
            {row.written_off_zar != null && row.written_off_zar > 0 && <Pair label="Written off" value={fmtZar(row.written_off_zar)} />}
            {row.data_cutoff_date && <Pair label="Data cutoff" value={row.data_cutoff_date} />}
          </div>

          {row.reconciliation_basis && <Pair label="Reconciliation basis" value={row.reconciliation_basis} />}
          {row.investigation_basis && <Pair label="Investigation basis" value={row.investigation_basis} />}
          {row.classification_basis && <Pair label="Classification basis" value={row.classification_basis} />}
          {row.recovery_basis && <Pair label="Recovery basis" value={row.recovery_basis} />}
          {row.dispute_basis && <Pair label="Dispute basis" value={row.dispute_basis} />}
          {row.resolution_basis && <Pair label="Resolution basis" value={row.resolution_basis} />}
          {row.writeoff_basis && <Pair label="Write-off basis" value={row.writeoff_basis} />}
          {row.cancellation_basis && <Pair label="Cancellation basis" value={row.cancellation_basis} />}
          {row.reason_code && <Pair label="Reason code" value={row.reason_code} />}

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
                  <ActionBtn label="Ingest meter / settlement / invoice (analyst)" onClick={() => {
                    const metered = window.prompt('Metered generation (MWh, optional):') ?? undefined;
                    const settled = window.prompt('Settled generation (MWh, optional):') ?? undefined;
                    const invoiced = window.prompt('Invoiced generation (MWh, optional):') ?? undefined;
                    const basis = window.prompt('Ingest basis (optional):') ?? undefined;
                    void doAction('ingest-data', {
                      metered_generation_mwh: metered ? Number(metered) : undefined,
                      settled_generation_mwh: settled ? Number(settled) : undefined,
                      invoiced_generation_mwh: invoiced ? Number(invoiced) : undefined,
                      ingest_basis: basis,
                    });
                  }} />
                )}
                {cs === 'data_ingested' && (
                  <ActionBtn label="Run reconciliation (analyst)" onClick={() => {
                    const expected = window.prompt('Expected generation (MWh, optional):') ?? undefined;
                    const expRev = window.prompt('Expected revenue (ZAR, optional):') ?? undefined;
                    const setRev = window.prompt('Settled revenue (ZAR, optional):') ?? undefined;
                    const variance = window.prompt('Variance (ZAR — negative = under-recovery, optional):') ?? undefined;
                    const basis = window.prompt('Reconciliation basis (optional):') ?? undefined;
                    void doAction('run-reconciliation', {
                      expected_generation_mwh: expected ? Number(expected) : undefined,
                      expected_revenue_zar: expRev ? Number(expRev) : undefined,
                      settled_revenue_zar: setRev ? Number(setRev) : undefined,
                      variance_zar: variance ? Number(variance) : undefined,
                      reconciliation_basis: basis,
                    });
                  }} />
                )}
                {cs === 'reconciled' && (
                  <ActionBtn label="Close clean (within tolerance)" tone="good" onClick={() => {
                    const basis = window.prompt('Closure basis (within tolerance):') ?? undefined;
                    const rc = window.prompt('Reason code (optional):') ?? undefined;
                    void doAction('close-clean', { reconciliation_basis: basis, reason_code: rc });
                  }} />
                )}
                {cs === 'reconciled' && (
                  <ActionBtn label="Flag variance (analyst)" tone="bad" onClick={() => {
                    const variance = window.prompt('Variance (ZAR — negative = under-recovery, optional):') ?? undefined;
                    const basis = window.prompt('Variance basis (optional):') ?? undefined;
                    const rc = window.prompt('Reason code (optional):') ?? undefined;
                    void doAction('flag-variance', {
                      variance_zar: variance ? Number(variance) : undefined,
                      reconciliation_basis: basis,
                      reason_code: rc,
                    });
                  }} />
                )}
                {cs === 'variance_flagged' && (
                  <ActionBtn label="Open investigation (analyst)" onClick={() => {
                    const ref = window.prompt('Investigation reference (optional):') ?? undefined;
                    const basis = window.prompt('Investigation basis (optional):') ?? undefined;
                    void doAction('open-investigation', { investigation_ref: ref, investigation_basis: basis });
                  }} />
                )}
                {cs === 'investigating' && (
                  <ActionBtn label="Classify leakage (analyst)" onClick={() => {
                    const cat = window.prompt('Leakage category (meter_drift / comms_gap / settlement_error / curtailment_shortfall / clipping_loss / meter_tampering):') ?? undefined;
                    const basis = window.prompt('Classification basis (optional):') ?? undefined;
                    void doAction('classify-leakage', { leakage_category: cat, classification_basis: basis });
                  }} />
                )}
                {cs === 'classified' && (
                  <ActionBtn label="Issue recovery claim (analyst)" onClick={() => {
                    const method = window.prompt('Recovery method (meter_recalibration / settlement_resubmission / dso_credit_note / ppa_true_up):') ?? undefined;
                    const target = window.prompt('Counterparty / recovery target (optional):') ?? undefined;
                    const basis = window.prompt('Recovery basis (optional):') ?? undefined;
                    void doAction('issue-recovery-claim', { recovery_method: method, counterparty_name: target, recovery_basis: basis });
                  }} />
                )}
                {cs === 'recovery_pending' && (
                  <ActionBtn label="Confirm recovery (counterparty)" tone="good" onClick={() => {
                    const amt = window.prompt('Recovered amount (ZAR):') ?? undefined;
                    const ref = window.prompt('Recovery reference (optional):') ?? undefined;
                    void doAction('confirm-recovery', { recovered_zar: amt ? Number(amt) : undefined, recovery_ref: ref });
                  }} />
                )}
                {cs === 'recovery_pending' && (
                  <ActionBtn label="Raise settlement dispute (analyst)" tone="bad" onClick={() => {
                    const basis = window.prompt('Dispute basis (settlement / metering disagreement):') ?? undefined;
                    const target = window.prompt('Counterparty (DSO / market operator):') ?? undefined;
                    void doAction('raise-dispute', { dispute_basis: basis, counterparty_name: target });
                  }} />
                )}
                {cs === 'in_dispute' && (
                  <ActionBtn label="Resolve — recovered (reviewer)" tone="good" onClick={() => {
                    const amt = window.prompt('Recovered amount (ZAR):') ?? undefined;
                    const basis = window.prompt('Resolution basis (optional):') ?? undefined;
                    void doAction('resolve-dispute-recovered', { recovered_zar: amt ? Number(amt) : undefined, resolution_basis: basis });
                  }} />
                )}
                {cs === 'in_dispute' && (
                  <ActionBtn label="Resolve — write off (reviewer)" tone="bad" onClick={() => {
                    const amt = window.prompt('Written-off amount (ZAR):') ?? undefined;
                    const basis = window.prompt('Write-off basis (unrecoverable):') ?? undefined;
                    void doAction('resolve-dispute-writeoff', { written_off_zar: amt ? Number(amt) : undefined, writeoff_basis: basis });
                  }} />
                )}
                {(cs === 'classified' || cs === 'recovery_pending') && (
                  <ActionBtn label="Write off (reviewer)" tone="bad" onClick={() => {
                    const amt = window.prompt('Written-off amount (ZAR):') ?? undefined;
                    const basis = window.prompt('Write-off basis (unrecoverable):') ?? undefined;
                    const rc = window.prompt('Reason code (optional):') ?? undefined;
                    void doAction('write-off', { written_off_zar: amt ? Number(amt) : undefined, writeoff_basis: basis, reason_code: rc });
                  }} />
                )}
                {cancellable && (
                  <ActionBtn label="Cancel (opened in error / superseded)" onClick={() => {
                    const basis = window.prompt('Cancellation basis (opened in error / superseded):') ?? undefined;
                    const rc = window.prompt('Reason code (optional):') ?? undefined;
                    void doAction('cancel-reconciliation', { cancellation_basis: basis, reason_code: rc });
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
