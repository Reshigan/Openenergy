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
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
const BG     = 'var(--s0, oklch(0.96 0.003 250))';
const BG1    = 'var(--s1, oklch(0.99 0.002 80))';
const BG2    = 'var(--s2, oklch(0.93 0.004 250))';
const BORDER = 'var(--border-subtle, oklch(0.87 0.006 250))';
const TX1    = 'var(--ink, oklch(0.17 0.010 250))';
const TX2    = 'var(--ink-2, oklch(0.40 0.009 250))';
const TX3    = 'var(--ink-2, oklch(0.60 0.007 250))';
const ACC    = 'var(--accent, oklch(0.46 0.16 55))';
const BAD    = 'var(--bad, oklch(0.48 0.20 20))';
const WARN   = 'var(--accent, oklch(0.50 0.18 55))';
const GOOD   = 'var(--good, oklch(0.40 0.16 155))';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'nomination_window_open' | 'da_nominated' | 'da_confirmed' | 'id_revised'
  | 'delivery_in_progress' | 'delivery_complete' | 'meter_data_received' | 'reconciled'
  | 'dispute_raised' | 'deviation_settled' | 'excused' | 'cancelled';

type Tier = 'minor' | 'standard' | 'material' | 'major';
type Urgency = 'critical' | 'high' | 'medium' | 'low';

interface PnomRow {
  [key: string]: unknown;
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

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'nomination_window_open',
  'da_nominated',
  'da_confirmed',
  'id_revised',
  'delivery_in_progress',
  'delivery_complete',
  'meter_data_received',
  'reconciled',
  'dispute_raised',
  'deviation_settled',
];

const BRANCH_STATES: readonly string[] = [
  'excused',
  'cancelled',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active_open',            label: 'Open' },
  { key: 'all',                    label: 'All' },
  { key: 'minor',                  label: 'Minor' },
  { key: 'standard',               label: 'Standard' },
  { key: 'material',               label: 'Material' },
  { key: 'major',                  label: 'Major' },
  { key: 'breached',               label: 'SLA breached' },
  { key: 'reportable',             label: 'Reportable' },
  { key: 'nomination_window_open', label: 'Window' },
  { key: 'da_nominated',           label: 'DA nom.' },
  { key: 'da_confirmed',           label: 'Confirmed' },
  { key: 'id_revised',             label: 'ID revised' },
  { key: 'delivery_in_progress',   label: 'Delivering' },
  { key: 'delivery_complete',      label: 'Delivered' },
  { key: 'meter_data_received',    label: 'Metered' },
  { key: 'reconciled',             label: 'Reconciled' },
  { key: 'dispute_raised',         label: 'Dispute' },
  { key: 'deviation_settled',      label: 'Settled' },
  { key: 'excused',                label: 'Excused' },
  { key: 'cancelled',              label: 'Cancelled' },
];

// ── action helpers ────────────────────────────────────────────────────────
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

function getActions(row: PnomRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  // Primary forward action per state
  if (s === 'nomination_window_open') {
    actions.push({
      key: 'submit-da-nomination',
      label: 'Submit day-ahead nomination (offtaker)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'da_nominated_mwh',
          label: 'Day-ahead nominated energy (MWh)',
          type: 'number',
          required: true,
          placeholder: String(row.da_nominated_mwh ?? ''),
        },
        {
          key: 'ppa_tariff_zar_per_mwh',
          label: 'PPA tariff (ZAR/MWh)',
          type: 'number',
          required: false,
          placeholder: String(row.ppa_tariff_zar_per_mwh ?? ''),
        },
        {
          key: 'deviation_tariff_zar_per_mwh',
          label: 'Deviation tariff (ZAR/MWh)',
          type: 'number',
          required: false,
          placeholder: String(row.deviation_tariff_zar_per_mwh ?? ''),
        },
      ],
    });
  }

  if (s === 'da_nominated') {
    actions.push({
      key: 'confirm-da',
      label: 'Confirm DA → ready for delivery (seller)',
      tone: 'primary',
      cascadeTo: [],
      fields: [],
    });
    actions.push({
      key: 'reject-da',
      label: 'Reject DA → renominate (seller)',
      tone: 'danger',
      cascadeTo: [],
      fields: [],
    });
  }

  if (s === 'da_confirmed' || s === 'id_revised') {
    actions.push({
      key: 'close-gate',
      label: 'Close gate → enter delivery (system operator)',
      tone: 'primary',
      cascadeTo: [],
      fields: [],
    });
    actions.push({
      key: 'submit-id-revision',
      label: 'Submit intra-day revision (offtaker)',
      tone: 'warn',
      cascadeTo: [],
      fields: [
        {
          key: 'id_revised_mwh',
          label: 'Intra-day revised energy (MWh)',
          type: 'number',
          required: true,
          placeholder: String(row.id_revised_mwh ?? row.effective_nominated_mwh ?? ''),
        },
      ],
    });
  }

  if (s === 'delivery_in_progress') {
    actions.push({
      key: 'complete-delivery',
      label: 'Complete delivery (seller)',
      tone: 'primary',
      cascadeTo: [],
      fields: [],
    });
  }

  if (s === 'delivery_complete') {
    actions.push({
      key: 'ingest-meter',
      label: 'Ingest meter data (independent meter)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'metered_mwh',
          label: 'Metered energy delivered (MWh)',
          type: 'number',
          required: true,
          placeholder: String(row.metered_mwh ?? ''),
        },
      ],
    });
  }

  if (s === 'meter_data_received') {
    actions.push({
      key: 'reconcile',
      label: 'Reconcile metered vs nominated (offtaker)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'metered_mwh',
          label: 'Final metered energy (MWh)',
          type: 'number',
          required: false,
          placeholder: String(row.metered_mwh ?? ''),
        },
        {
          key: 'weather_attributable_pct',
          label: 'Weather-attributable deviation (%)',
          type: 'number',
          required: false,
          placeholder: String(row.weather_attributable_pct ?? '0'),
        },
      ],
    });
  }

  if (s === 'reconciled') {
    actions.push({
      key: 'settle-deviation',
      label: 'Settle deviation at tariff (offtaker)',
      tone: 'primary',
      // crosses for material + major
      cascadeTo: [],
      fields: [
        {
          key: 'settled_amount_zar',
          label: 'Settlement amount (ZAR)',
          type: 'number',
          required: true,
          placeholder: String(row.predicted_penalty_zar_live ?? row.predicted_penalty_zar ?? ''),
        },
      ],
    });
    actions.push({
      key: 'raise-dispute',
      label: 'Raise dispute → NERSA s30 (offtaker)',
      tone: 'danger',
      // crosses for EVERY tier (W87 signature)
      cascadeTo: ['regulator'],
      fields: [
        {
          key: 'dispute_ground',
          label: 'Dispute ground (metering / tariff / reconciliation / other)',
          type: 'text',
          required: true,
          placeholder: '',
        },
        {
          key: 'regulator_ref',
          label: 'NERSA s30 reference (if known)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (s === 'dispute_raised') {
    actions.push({
      key: 'resolve-dispute',
      label: 'Resolve dispute → back to reconciled (offtaker)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        {
          key: 'dispute_resolution_ref',
          label: 'Dispute resolution reference',
          type: 'text',
          required: true,
          placeholder: '',
        },
      ],
    });
  }

  // Cross-state secondary actions
  if (!TERMINAL_STATES.includes(s)) {
    actions.push({
      key: 'excuse-period',
      label: 'Excuse period (force-majeure / curtailment)',
      tone: 'muted',
      // crosses for material + major
      cascadeTo: [],
      fields: [
        {
          key: 'excuse_reason',
          label: `Excuse reason (${EXCUSE_REASONS.join(' / ')})`,
          type: 'text',
          required: true,
          placeholder: 'force_majeure',
        },
        {
          key: 'excuse_evidence_ref',
          label: 'Evidence reference (NERSA cert / SO notice / wx report)',
          type: 'text',
          required: false,
          placeholder: '',
        },
      ],
    });
  }

  if (CANCEL_FROM.includes(s)) {
    actions.push({
      key: 'cancel-nomination',
      label: 'Cancel nomination (pre-delivery)',
      tone: 'muted',
      cascadeTo: [],
      fields: [
        {
          key: 'reason_code',
          label: 'Cancellation reason',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
    });
  }

  return actions;
}

function renderDetail(row: PnomRow): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="Deviation tier"      value={row.deviation_tier} />
      <DetailPair label="Urgency"             value={row.urgency_band_live ?? '—'} />
      <DetailPair label="DA nominated"        value={fmtMwh(row.da_nominated_mwh)} />
      <DetailPair label="ID revised"          value={fmtMwh(row.id_revised_mwh)} />
      <DetailPair label="Effective nom."      value={fmtMwh(row.effective_nominated_mwh)} />
      <DetailPair label="Metered"             value={fmtMwh(row.metered_mwh)} />
      <DetailPair label="|deviation| MWh"     value={fmtMwh(row.absolute_deviation_mwh_live ?? row.absolute_deviation_mwh)} />
      <DetailPair label="|deviation| %"       value={fmtPct(row.absolute_deviation_pct_live ?? row.absolute_deviation_pct)} />
      <DetailPair label="Signed dev. MWh"     value={fmtMwh(row.signed_deviation_mwh_live ?? row.signed_deviation_mwh)} />
      <DetailPair label="Capacity factor"     value={fmtPct(row.capacity_factor_realized_live)} />
      <DetailPair label="Forecast accuracy"   value={fmtPct(row.forecast_accuracy_pct_live)} />
      <DetailPair label="Wx-attributable %"   value={fmtPct(row.weather_attributable_pct)} />
      <DetailPair label="Wx-normalised dev"   value={fmtPct(row.weather_normalized_deviation_live)} />
      <DetailPair label="Trend (3 period)"    value={fmtPct(row.deviation_trend_3_period_live)} />
      <DetailPair label="ID revisions"        value={String(row.id_revision_count)} />
      <DetailPair label="PPA tariff"          value={`R${row.ppa_tariff_zar_per_mwh.toFixed(0)}/MWh`} />
      <DetailPair label="Deviation tariff"    value={`R${row.deviation_tariff_zar_per_mwh.toFixed(0)}/MWh`} />
      <DetailPair label="Penalty tariff"      value={`R${row.penalty_tariff_zar_per_mwh.toFixed(0)}/MWh`} />
      <DetailPair label="Contract value"      value={fmtZar(row.contract_value_zar)} />
      <DetailPair label="Deviation value"     value={fmtZar(row.deviation_value_zar_live ?? row.deviation_value_zar)} />
      <DetailPair label="Predicted penalty"   value={fmtZar(row.predicted_penalty_zar_live ?? row.predicted_penalty_zar)} />
      <DetailPair label="Settled amount"      value={fmtZar(row.settled_amount_zar)} />
      <DetailPair label="Excuse reason"       value={row.excuse_reason ?? '—'} />
      <DetailPair label="Excuse evidence"     value={row.excuse_evidence_ref ?? '—'} />
      <DetailPair label="Dispute ground"      value={row.dispute_ground ?? '—'} />
      <DetailPair label="Dispute resolution"  value={row.dispute_resolution_ref ?? '—'} />
      <DetailPair label="Reason code"         value={row.reason_code ?? '—'} />
      <DetailPair label="Window opened"       value={fmtDate(row.nomination_window_open_at)} />
      <DetailPair label="DA nominated at"     value={fmtDate(row.da_nominated_at)} />
      <DetailPair label="DA confirmed at"     value={fmtDate(row.da_confirmed_at)} />
      <DetailPair label="ID revised at"       value={fmtDate(row.id_revised_at)} />
      <DetailPair label="Delivery start"      value={fmtDate(row.delivery_in_progress_at)} />
      <DetailPair label="Delivery complete"   value={fmtDate(row.delivery_complete_at)} />
      <DetailPair label="Meter received"      value={fmtDate(row.meter_data_received_at)} />
      <DetailPair label="Reconciled"          value={fmtDate(row.reconciled_at)} />
      <DetailPair label="Dispute raised"      value={fmtDate(row.dispute_raised_at)} />
      <DetailPair label="Settled at"          value={fmtDate(row.deviation_settled_at)} />
      <DetailPair label="Excused at"          value={fmtDate(row.excused_at)} />
      <DetailPair label="SLA deadline"        value={fmtDate(row.sla_deadline_at)} />
      <DetailPair label="SLA status"          value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
      <DetailPair label="Days remaining"      value={row.sla_days_remaining_live != null ? `${row.sla_days_remaining_live.toFixed(1)}d` : '—'} />
      <DetailPair label="Escalation lvl"      value={String(row.escalation_level)} />
      <DetailPair label="Reportable"          value={row.is_reportable_flag ? 'Yes' : 'No'} />
      <DetailPair label="System operator"     value={row.system_operator_name ?? '—'} />
      <DetailPair label="Meter operator"      value={row.meter_operator_name ?? '—'} />
      <DetailPair label="Installed cap."      value={`${row.installed_capacity_mw} MW`} />
      <DetailPair label="Delivery period"     value={row.delivery_period_label} />
      <DetailPair label="Period hours"        value={String(row.delivery_period_hours)} />
      <DetailPair label="NERSA s30 ref"       value={row.regulator_ref ?? '—'} />
      {row.nomination_summary && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Nomination summary</div>
          <div style={{ color: TX2 }}>{row.nomination_summary}</div>
        </div>
      )}
      {row.chain_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Chain basis</div>
          <div style={{ color: TX2 }}>{row.chain_basis}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function PpaNominationChainTab() {
  const [rows, setRows] = useState<PnomRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active_open');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: PnomRow[] } & KpiSummary }>('/ppa-nomination/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        setKpis({
          total: d.total,
          open_count: d.open_count,
          settled_count: d.settled_count,
          excused_count: d.excused_count,
          cancelled_count: d.cancelled_count,
          dispute_count: d.dispute_count,
          reconciled_count: d.reconciled_count,
          in_delivery_count: d.in_delivery_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          total_nominated_mwh: d.total_nominated_mwh,
          total_metered_mwh: d.total_metered_mwh,
          total_deviation_mwh: d.total_deviation_mwh,
          total_settled_zar: d.total_settled_zar,
          total_predicted_penalty_zar: d.total_predicted_penalty_zar,
          critical_urgency_count: d.critical_urgency_count,
          major_tier_count: d.major_tier_count,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load PPA nominations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/ppa-nomination/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ppa-nomination/chain/${rowId}`);
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
      const res = await api.get<{ data: { case: PnomRow; events: ChainEvent[] } }>(`/ppa-nomination/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')           return true;
      if (filter === 'active_open')   return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'minor')         return r.deviation_tier === 'minor';
      if (filter === 'standard')      return r.deviation_tier === 'standard';
      if (filter === 'material')      return r.deviation_tier === 'material';
      if (filter === 'major')         return r.deviation_tier === 'major';
      if (filter === 'breached')      return !!r.sla_breached;
      if (filter === 'reportable')    return !!r.is_reportable_flag;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const k = kpis ?? {
    total: 0, open_count: 0, settled_count: 0, excused_count: 0, cancelled_count: 0,
    dispute_count: 0, reconciled_count: 0, in_delivery_count: 0, breached: 0,
    reportable_total: 0, total_nominated_mwh: 0, total_metered_mwh: 0,
    total_deviation_mwh: 0, total_settled_zar: 0, total_predicted_penalty_zar: 0,
    critical_urgency_count: 0, major_tier_count: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>
          Offtaker PPA scheduled-energy nomination &amp; deviation settlement
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-stage P6 chain · window open → day-ahead nomination → confirmation → optional intra-day revision →
          gate closure → delivery → meter ingestion → reconciliation → deviation settlement at the tariff.
          URGENT SLA (larger deviation = tighter every window). Raising a dispute crosses to the regulator
          inbox for EVERY tier (NERSA s30); excusing a period and settling cross for material + major.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"            value={k.total} />
        <KpiTile label="Open"             value={k.open_count} />
        <KpiTile label="In delivery"      value={k.in_delivery_count} />
        <KpiTile label="Reconciled"       value={k.reconciled_count} />
        <KpiTile label="Settled"          value={k.settled_count} tone="ok" />
        <KpiTile label="Disputed"         value={k.dispute_count} tone={k.dispute_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Excused"          value={k.excused_count} />
        <KpiTile label="Major tier"       value={k.major_tier_count} tone={k.major_tier_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Critical urgency" value={k.critical_urgency_count} tone={k.critical_urgency_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Reportable"       value={k.reportable_total} tone={k.reportable_total > 0 ? 'warn' : 'ok'} />
        <KpiTile label="SLA breached"     value={k.breached} tone={k.breached > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Nominated total"  value={fmtMwh(k.total_nominated_mwh)} />
        <KpiTile label="Metered total"    value={fmtMwh(k.total_metered_mwh)} />
        <KpiTile label="Deviation total"  value={fmtMwh(k.total_deviation_mwh)} tone="warn" />
        <KpiTile label="Settled (ZAR)"    value={fmtZar(k.total_settled_zar)} tone="ok" />
        <KpiTile label="Predicted penalty" value={fmtZar(k.total_predicted_penalty_zar)} tone="warn" />
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
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
          Loading...
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.nomination_number} · ${row.facility_name}`}
              meta={
                <span style={{ fontFamily: MONO, fontSize: 10, color: TX3 }}>
                  {row.delivery_period_label} · {row.deviation_tier} · seller {row.seller_name}
                  {row.is_reportable_flag && (
                    <span style={{ color: BAD, marginLeft: 4 }} title="Reportable to regulator">● reportable</span>
                  )}
                </span>
              }
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No nominations match.
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
      <div style={{ color: TX1, fontSize: 11 }}>{value}</div>
    </div>
  );
}

export default PpaNominationChainTab;
