// Wave 87 — Offtaker PPA Scheduled-Energy Nomination & Deviation Settlement tab.
//
// 12-state P6 chain on oe_ppa_nominations. The daily/monthly operational pulse
// of any PPA: day-ahead nomination → confirmation → optional intra-day
// revision → gate closure → delivery → meter ingestion → reconciliation →
// SETTLEMENT at the deviation tariff. Dispute branch lands in NERSA s30.
// Excused branch catches force-majeure / curtailment. Tier RE-DERIVED on
// every transition from |deviation|% so a clean nomination can deteriorate
// into major as meter data arrives, and a dispute resolution can pull a major
// period back to minor. URGENT SLA (larger deviation = tighter every window).
//
// Reportability (the W87 signature): raise_dispute crosses for EVERY tier
// (PPA disputes always go to NERSA s30); excuse_period and settle_deviation
// cross for material + major; SLA breaches cross for material + major.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'nomination_window_open' | 'da_nominated' | 'da_confirmed' | 'id_revised'
  | 'delivery_in_progress' | 'delivery_complete' | 'meter_data_received' | 'reconciled'
  | 'dispute_raised' | 'deviation_settled' | 'excused' | 'cancelled';

type Tier = 'minor' | 'standard' | 'material' | 'major';
type Urgency = 'critical' | 'high' | 'medium' | 'low';

interface PnomRow {
  id: string;
  nomination_number: string;
  ppa_id: string;
  ppa_reference: string;
  offtaker_id: string;
  offtaker_name: string;
  seller_id: string;
  seller_name: string;
  facility_id: string;
  facility_name: string;
  system_operator_name: string | null;
  meter_operator_name: string | null;
  delivery_period_label: string;
  delivery_period_start: string;
  delivery_period_end: string;
  delivery_period_hours: number;
  installed_capacity_mw: number;
  da_nominated_mwh: number;
  id_revised_mwh: number | null;
  effective_nominated_mwh: number;
  metered_mwh: number | null;
  signed_deviation_mwh: number;
  absolute_deviation_mwh: number;
  absolute_deviation_pct: number;
  weather_attributable_pct: number;
  ppa_tariff_zar_per_mwh: number;
  deviation_tariff_zar_per_mwh: number;
  penalty_tariff_zar_per_mwh: number;
  contract_value_zar: number;
  deviation_value_zar: number;
  predicted_penalty_zar: number;
  settled_amount_zar: number | null;
  excuse_reason: string | null;
  excuse_evidence_ref: string | null;
  dispute_ground: string | null;
  dispute_resolution_ref: string | null;
  id_revision_count: number;
  deviation_tier: Tier;
  last_action_ref: string | null;
  regulator_ref: string | null;
  chain_basis: string | null;
  reason_code: string | null;
  nomination_summary: string | null;
  chain_status: ChainStatus;
  nomination_window_open_at: string;
  da_nominated_at: string | null;
  da_confirmed_at: string | null;
  id_revised_at: string | null;
  delivery_in_progress_at: string | null;
  delivery_complete_at: string | null;
  meter_data_received_at: string | null;
  reconciled_at: string | null;
  dispute_raised_at: string | null;
  deviation_settled_at: string | null;
  excused_at: string | null;
  cancelled_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  absolute_deviation_mwh_live?: number;
  absolute_deviation_pct_live?: number;
  signed_deviation_mwh_live?: number;
  deviation_value_zar_live?: number;
  predicted_penalty_zar_live?: number;
  capacity_factor_realized_live?: number;
  forecast_accuracy_pct_live?: number;
  weather_normalized_deviation_live?: number;
  deviation_trend_3_period_live?: number;
  predicted_resolution_days_live?: number;
  sla_days_remaining_live?: number;
  urgency_band_live?: Urgency;
}

interface PnomEvent {
  id: string;
  nomination_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

interface KpiSummary {
  total: number;
  open_count: number;
  settled_count: number;
  excused_count: number;
  cancelled_count: number;
  dispute_count: number;
  reconciled_count: number;
  in_delivery_count: number;
  breached: number;
  reportable_total: number;
  total_nominated_mwh: number;
  total_metered_mwh: number;
  total_deviation_mwh: number;
  total_settled_zar: number;
  total_predicted_penalty_zar: number;
  critical_urgency_count: number;
  major_tier_count: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  nomination_window_open: { bg: '#e3e7ec', fg: '#557',    label: 'Window open' },
  da_nominated:           { bg: '#dbecfb', fg: '#1a3a5c', label: 'DA nominated' },
  da_confirmed:           { bg: '#dbecfb', fg: '#1a3a5c', label: 'DA confirmed' },
  id_revised:             { bg: '#fff4d6', fg: '#a06200', label: 'ID revised' },
  delivery_in_progress:   { bg: '#fff4d6', fg: '#8a4a00', label: 'In delivery' },
  delivery_complete:      { bg: '#daf5e2', fg: '#1f6b3a', label: 'Delivered' },
  meter_data_received:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Meter received' },
  reconciled:             { bg: '#daf5e2', fg: '#155724', label: 'Reconciled' },
  dispute_raised:         { bg: '#ffe4e1', fg: '#a04040', label: 'Dispute raised' },
  deviation_settled:      { bg: '#d4edda', fg: '#155724', label: 'Settled' },
  excused:                { bg: '#ede0e0', fg: '#6b3a3a', label: 'Excused' },
  cancelled:              { bg: '#ede0e0', fg: '#6b3a3a', label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor <5%' },
  standard: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard 5-10%' },
  material: { bg: '#fff4d6', fg: '#8a4a00', label: 'Material 10-20%' },
  major:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Major ≥20%' },
};

const URGENCY_TONE: Record<Urgency, { bg: string; fg: string; label: string }> = {
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
  high:     { bg: '#ffe4b5', fg: '#a06200', label: 'High' },
  medium:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Medium' },
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active_open',           label: 'Open' },
  { key: 'all',                   label: 'All' },
  { key: 'minor',                 label: 'Minor' },
  { key: 'standard',              label: 'Standard' },
  { key: 'material',              label: 'Material' },
  { key: 'major',                 label: 'Major' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'nomination_window_open', label: 'Window' },
  { key: 'da_nominated',          label: 'DA nom.' },
  { key: 'da_confirmed',          label: 'Confirmed' },
  { key: 'id_revised',            label: 'ID revised' },
  { key: 'delivery_in_progress',  label: 'Delivering' },
  { key: 'delivery_complete',     label: 'Delivered' },
  { key: 'meter_data_received',   label: 'Metered' },
  { key: 'reconciled',            label: 'Reconciled' },
  { key: 'dispute_raised',        label: 'Dispute' },
  { key: 'deviation_settled',     label: 'Settled' },
  { key: 'excused',               label: 'Excused' },
  { key: 'cancelled',             label: 'Cancelled' },
];

type ActionKind =
  | 'submit-da-nomination' | 'confirm-da' | 'reject-da' | 'submit-id-revision'
  | 'close-gate' | 'complete-delivery' | 'ingest-meter' | 'reconcile'
  | 'raise-dispute' | 'resolve-dispute' | 'settle-deviation' | 'excuse-period'
  | 'cancel-nomination';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  nomination_window_open: 'submit-da-nomination',
  da_nominated:           'confirm-da',
  da_confirmed:           'close-gate',
  id_revised:             'close-gate',
  delivery_in_progress:   'complete-delivery',
  delivery_complete:      'ingest-meter',
  meter_data_received:    'reconcile',
  reconciled:             'settle-deviation',
  dispute_raised:         'resolve-dispute',
  deviation_settled:      null,
  excused:                null,
  cancelled:              null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'submit-da-nomination': 'Submit day-ahead nomination (offtaker)',
  'confirm-da':           'Confirm DA → ready for delivery (seller)',
  'reject-da':            'Reject DA → renominate (seller)',
  'submit-id-revision':   'Submit intra-day revision (offtaker)',
  'close-gate':           'Close gate → enter delivery (system operator)',
  'complete-delivery':    'Complete delivery (seller)',
  'ingest-meter':         'Ingest meter data (independent meter)',
  'reconcile':            'Reconcile metered vs nominated (offtaker)',
  'raise-dispute':        'Raise dispute → NERSA s30 (offtaker)',
  'resolve-dispute':      'Resolve dispute → back to reconciled (offtaker)',
  'settle-deviation':     'Settle deviation at tariff (offtaker)',
  'excuse-period':        'Excuse period (force-majeure / curtailment)',
  'cancel-nomination':    'Cancel nomination (pre-delivery)',
};

const EXCUSE_REASONS = ['force_majeure', 'curtailment', 'grid_outage'];
const CANCEL_FROM: ChainStatus[] = ['nomination_window_open', 'da_nominated'];
const TERMINAL_STATES: ChainStatus[] = ['deviation_settled', 'excused', 'cancelled'];

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtMwh(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(2)} GWh`;
  return `${n.toFixed(1)} MWh`;
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(1)}k`;
  return `R${Math.round(n)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(1)}%`;
}

export function PpaNominationChainTab() {
  const [rows, setRows] = useState<PnomRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active_open');
  const [selected, setSelected] = useState<PnomRow | null>(null);
  const [events, setEvents] = useState<PnomEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: PnomRow[] } & KpiSummary }>('/ppa-nomination/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, settled_count: d.settled_count,
          excused_count: d.excused_count, cancelled_count: d.cancelled_count,
          dispute_count: d.dispute_count, reconciled_count: d.reconciled_count,
          in_delivery_count: d.in_delivery_count, breached: d.breached,
          reportable_total: d.reportable_total,
          total_nominated_mwh: d.total_nominated_mwh, total_metered_mwh: d.total_metered_mwh,
          total_deviation_mwh: d.total_deviation_mwh, total_settled_zar: d.total_settled_zar,
          total_predicted_penalty_zar: d.total_predicted_penalty_zar,
          critical_urgency_count: d.critical_urgency_count, major_tier_count: d.major_tier_count,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load PPA nominations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: PnomRow; events: PnomEvent[] } }>(`/ppa-nomination/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load nomination history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')         return true;
      if (filter === 'active_open') return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'minor')       return r.deviation_tier === 'minor';
      if (filter === 'standard')    return r.deviation_tier === 'standard';
      if (filter === 'material')    return r.deviation_tier === 'material';
      if (filter === 'major')       return r.deviation_tier === 'major';
      if (filter === 'breached')    return !!r.sla_breached;
      if (filter === 'reportable')  return !!r.is_reportable_flag;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: PnomRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'submit-da-nomination') {
        const mwh = window.prompt('Day-ahead nominated energy (MWh):', String(row.da_nominated_mwh ?? ''));
        if (!mwh) return;
        const tariff = window.prompt('PPA tariff (ZAR/MWh):', String(row.ppa_tariff_zar_per_mwh ?? '')) || '';
        const devTariff = window.prompt('Deviation tariff (ZAR/MWh):', String(row.deviation_tariff_zar_per_mwh ?? '')) || '';
        body = { da_nominated_mwh: Number(mwh), effective_nominated_mwh: Number(mwh) };
        if (tariff) body.ppa_tariff_zar_per_mwh = Number(tariff);
        if (devTariff) body.deviation_tariff_zar_per_mwh = Number(devTariff);
      } else if (action === 'submit-id-revision') {
        const mwh = window.prompt('Intra-day revised energy (MWh):', String(row.id_revised_mwh ?? row.effective_nominated_mwh ?? ''));
        if (!mwh) return;
        body = { id_revised_mwh: Number(mwh), effective_nominated_mwh: Number(mwh) };
      } else if (action === 'ingest-meter') {
        const mwh = window.prompt('Metered energy delivered (MWh):', String(row.metered_mwh ?? ''));
        if (!mwh) return;
        body = { metered_mwh: Number(mwh) };
      } else if (action === 'reconcile') {
        const mwh = window.prompt('Final metered energy (MWh):', String(row.metered_mwh ?? ''));
        const wx = window.prompt('Weather-attributable deviation (%):', String(row.weather_attributable_pct ?? '0')) || '';
        if (mwh) body.metered_mwh = Number(mwh);
        if (wx) body.weather_attributable_pct = Number(wx);
      } else if (action === 'raise-dispute') {
        const ground = window.prompt('Dispute ground (metering / tariff / reconciliation / other):');
        if (!ground) return;
        const ref = window.prompt('NERSA s30 reference (if known):') || '';
        body = { dispute_ground: ground };
        if (ref) body.regulator_ref = ref;
      } else if (action === 'resolve-dispute') {
        const ref = window.prompt('Dispute resolution reference:');
        if (!ref) return;
        body = { dispute_resolution_ref: ref };
      } else if (action === 'settle-deviation') {
        const amt = window.prompt('Settlement amount (ZAR):', String(row.predicted_penalty_zar_live ?? row.predicted_penalty_zar ?? ''));
        if (!amt) return;
        body = { settled_amount_zar: Number(amt) };
      } else if (action === 'excuse-period') {
        const reason = window.prompt(`Excuse reason (${EXCUSE_REASONS.join(' / ')}):`, 'force_majeure');
        if (!reason) return;
        const evidence = window.prompt('Evidence reference (NERSA cert / SO notice / wx report):') || '';
        body = { excuse_reason: reason };
        if (evidence) body.excuse_evidence_ref = evidence;
      } else if (action === 'cancel-nomination') {
        const reason = window.prompt('Cancellation reason:');
        if (!reason) return;
        body = { reason_code: reason };
      }
      await api.post(`/ppa-nomination/chain/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${action}`);
    }
  }, [load, loadEvents, selected]);

  return (
    <div className="p-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Offtaker PPA scheduled-energy nomination & deviation settlement</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage P6 chain · window open → day-ahead nomination → confirmation → optional intra-day revision → gate
            closure → delivery → meter ingestion → reconciliation → deviation settlement at the tariff. The
            daily/monthly operational pulse of every PPA — every other Offtaker chain handles exceptions. URGENT SLA
            (larger deviation = tighter every window). Live nomination-integrity battery surfaces |dev| MWh + %, signed
            deviation, predicted penalty at the ×1.0/1.2/1.5/2.0 band ladder, capacity-factor realized, forecast
            accuracy, weather-normalised residual, 3-period trend and urgency band on every record. Raising a dispute
            crosses to the regulator inbox for EVERY tier (NERSA s30); excusing a period (force-majeure / curtailment)
            and settling a deviation cross for material + major; SLA breaches cross for material + major.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="In delivery" value={kpis?.in_delivery_count ?? 0} />
        <Kpi label="Reconciled" value={kpis?.reconciled_count ?? 0} />
        <Kpi label="Settled" value={kpis?.settled_count ?? 0} tone="ok" />
        <Kpi label="Disputed" value={kpis?.dispute_count ?? 0} tone={(kpis?.dispute_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Excused" value={kpis?.excused_count ?? 0} />
        <Kpi label="Major tier" value={kpis?.major_tier_count ?? 0} tone={(kpis?.major_tier_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Critical urgency" value={kpis?.critical_urgency_count ?? 0} tone={(kpis?.critical_urgency_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Nominated total" value={fmtMwh(kpis?.total_nominated_mwh)} />
        <Kpi label="Metered total" value={fmtMwh(kpis?.total_metered_mwh)} />
        <Kpi label="Deviation total" value={fmtMwh(kpis?.total_deviation_mwh)} tone="warn" />
        <Kpi label="Settled (ZAR)" value={fmtZar(kpis?.total_settled_zar)} tone="ok" />
        <Kpi label="Predicted penalty" value={fmtZar(kpis?.total_predicted_penalty_zar)} tone="warn" />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
                : 'bg-white text-[#4a5568] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">{err}</div>
      )}
      {loading ? (
        <div className="rounded border border-[#d8dde6] bg-white px-4 py-6 text-center text-sm text-[#4a5568]">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded border border-[#d8dde6] bg-white">
          <table className="w-full text-[12px]">
            <thead className="bg-[#f3f5f9]">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Nom. #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Facility / seller</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Period</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Nominated</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Metered</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">|dev|</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Urgency</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.deviation_tier];
                const urgency = r.urgency_band_live ? URGENCY_TONE[r.urgency_band_live] : null;
                const absPct = r.absolute_deviation_pct_live ?? r.absolute_deviation_pct;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.nomination_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[280px] truncate" title={`${r.facility_name} · ${r.seller_name}`}>
                      {r.facility_name}
                      <span className="text-[#4a5568]"> · {r.seller_name}</span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568] font-mono text-[11px]">{r.delivery_period_label}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtMwh(r.effective_nominated_mwh)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtMwh(r.metered_mwh)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">
                      {fmtMwh(r.absolute_deviation_mwh_live ?? r.absolute_deviation_mwh)}
                      <span className="block text-[10px] text-[#a06200]">{fmtPct(absPct)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {urgency ? (
                        <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: urgency.bg, color: urgency.fg }}>
                          {urgency.label}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-[#4a5568]">No nominations match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0c2a4d';
  return (
    <div className="rounded border border-[#d8dde6] bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function Drawer({
  row, events, onClose, onAct,
}: {
  row: PnomRow;
  events: PnomEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: PnomRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canRejectDa = row.chain_status === 'da_nominated';
  const canRevise = row.chain_status === 'da_confirmed' || row.chain_status === 'id_revised';
  const canRaiseDispute = row.chain_status === 'reconciled';
  const canExcuse = !TERMINAL_STATES.includes(row.chain_status);
  const canCancel = CANCEL_FROM.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[760px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.nomination_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.facility_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.deviation_tier].label} · seller {row.seller_name} · offtaker {row.offtaker_name}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                PPA {row.ppa_reference} · period {row.delivery_period_label} · {row.installed_capacity_mw} MW
              </div>
              {row.system_operator_name && (
                <div className="mt-1 text-[11px] text-[#4a5568]">SO {row.system_operator_name}{row.meter_operator_name ? ` · meter ${row.meter_operator_name}` : ''}</div>
              )}
              {row.regulator_ref && (
                <div className="mt-1 text-[11px] text-[#a04040]">NERSA s30: {row.regulator_ref}</div>
              )}
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"             value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"              value={TIER_TONE[row.deviation_tier].label} />
            <Pair label="Urgency"           value={row.urgency_band_live ? URGENCY_TONE[row.urgency_band_live].label : '—'} />
            <Pair label="DA nominated"      value={fmtMwh(row.da_nominated_mwh)} />
            <Pair label="ID revised"        value={fmtMwh(row.id_revised_mwh)} />
            <Pair label="Effective nom."    value={fmtMwh(row.effective_nominated_mwh)} />
            <Pair label="Metered"           value={fmtMwh(row.metered_mwh)} />
            <Pair label="|deviation| MWh"   value={fmtMwh(row.absolute_deviation_mwh_live ?? row.absolute_deviation_mwh)} />
            <Pair label="|deviation| %"     value={fmtPct(row.absolute_deviation_pct_live ?? row.absolute_deviation_pct)} />
            <Pair label="Signed dev. MWh"   value={fmtMwh(row.signed_deviation_mwh_live ?? row.signed_deviation_mwh)} />
            <Pair label="Capacity factor"   value={fmtPct(row.capacity_factor_realized_live)} />
            <Pair label="Forecast accuracy" value={fmtPct(row.forecast_accuracy_pct_live)} />
            <Pair label="Wx-attributable %" value={fmtPct(row.weather_attributable_pct)} />
            <Pair label="Wx-normalised dev" value={fmtPct(row.weather_normalized_deviation_live)} />
            <Pair label="Trend (3 period)"  value={fmtPct(row.deviation_trend_3_period_live)} />
            <Pair label="ID revisions"      value={String(row.id_revision_count)} />
            <Pair label="PPA tariff"        value={`R${row.ppa_tariff_zar_per_mwh.toFixed(0)}/MWh`} />
            <Pair label="Deviation tariff"  value={`R${row.deviation_tariff_zar_per_mwh.toFixed(0)}/MWh`} />
            <Pair label="Penalty tariff"    value={`R${row.penalty_tariff_zar_per_mwh.toFixed(0)}/MWh`} />
            <Pair label="Contract value"    value={fmtZar(row.contract_value_zar)} />
            <Pair label="Deviation value"   value={fmtZar(row.deviation_value_zar_live ?? row.deviation_value_zar)} />
            <Pair label="Predicted penalty" value={fmtZar(row.predicted_penalty_zar_live ?? row.predicted_penalty_zar)} />
            <Pair label="Settled amount"    value={fmtZar(row.settled_amount_zar)} />
            <Pair label="Excuse reason"     value={row.excuse_reason ?? '—'} />
            <Pair label="Excuse evidence"   value={row.excuse_evidence_ref ?? '—'} />
            <Pair label="Dispute ground"    value={row.dispute_ground ?? '—'} />
            <Pair label="Dispute resolution" value={row.dispute_resolution_ref ?? '—'} />
            <Pair label="Reason code"       value={row.reason_code ?? '—'} />
            <Pair label="Window opened"     value={fmtDate(row.nomination_window_open_at)} />
            <Pair label="DA nominated at"   value={fmtDate(row.da_nominated_at)} />
            <Pair label="DA confirmed at"   value={fmtDate(row.da_confirmed_at)} />
            <Pair label="ID revised at"     value={fmtDate(row.id_revised_at)} />
            <Pair label="Delivery start"    value={fmtDate(row.delivery_in_progress_at)} />
            <Pair label="Delivery complete" value={fmtDate(row.delivery_complete_at)} />
            <Pair label="Meter received"    value={fmtDate(row.meter_data_received_at)} />
            <Pair label="Reconciled"        value={fmtDate(row.reconciled_at)} />
            <Pair label="Dispute raised"    value={fmtDate(row.dispute_raised_at)} />
            <Pair label="Settled at"        value={fmtDate(row.deviation_settled_at)} />
            <Pair label="Excused at"        value={fmtDate(row.excused_at)} />
            <Pair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"        value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Days remaining"    value={row.sla_days_remaining_live != null ? `${row.sla_days_remaining_live.toFixed(1)}d` : '—'} />
            <Pair label="Escalation lvl"    value={String(row.escalation_level)} />
            <Pair label="Reportable"        value={row.is_reportable_flag ? 'Yes' : 'No'} />
          </div>
          {row.nomination_summary && <BasisBlock label="Nomination summary" tone="#1a3a5c" text={row.nomination_summary} />}
          {row.chain_basis && <BasisBlock label="Chain basis" tone="#557" text={row.chain_basis} />}
        </section>

        {(nextAction || canRejectDa || canRevise || canRaiseDispute || canExcuse || canCancel) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#c2873a]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canRejectDa && (
                <button type="button"
                  onClick={() => onAct('reject-da', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['reject-da']}
                </button>
              )}
              {canRevise && (
                <button type="button"
                  onClick={() => onAct('submit-id-revision', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#a06200] hover:bg-[#fff6e2]"
                >
                  {ACTION_LABEL['submit-id-revision']}
                </button>
              )}
              {canRaiseDispute && (
                <button type="button"
                  onClick={() => onAct('raise-dispute', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['raise-dispute']}
                </button>
              )}
              {canExcuse && (
                <button type="button"
                  onClick={() => onAct('excuse-period', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b3a3a] hover:bg-[#f3eded]"
                >
                  {ACTION_LABEL['excuse-period']}
                </button>
              )}
              {canCancel && (
                <button type="button"
                  onClick={() => onAct('cancel-nomination', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b3a3a] hover:bg-[#f3eded]"
                >
                  {ACTION_LABEL['cancel-nomination']}
                </button>
              )}
            </div>
          </section>
        )}

        <section className="px-5 py-4">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Audit timeline</div>
          {events.length === 0 ? (
            <div className="text-[12px] text-[#4a5568]">No events yet.</div>
          ) : (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#0c2a4d]">{e.event_type}</span>
                    <span className="text-[#4a5568] tabular-nums">{fmtDate(e.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    {(e.from_status || e.to_status) && (
                      <span className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</span>
                    )}
                    {e.actor_party && (
                      <span className="rounded bg-[#eef1f6] px-1.5 py-0.5 text-[10px] font-medium text-[#4a5568]">{e.actor_party}</span>
                    )}
                  </div>
                  {e.notes && <div className="mt-1 text-[#1a3a5c]">{e.notes}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function BasisBlock({ label, tone, text }: { label: string; tone: string; text: string }) {
  return (
    <div className="mt-3 text-[12px]">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: tone }}>{label}</div>
      <div className="whitespace-pre-wrap" style={{ color: tone }}>{text}</div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}
