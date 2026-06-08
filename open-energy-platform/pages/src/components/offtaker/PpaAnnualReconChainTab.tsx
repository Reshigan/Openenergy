// Wave 101 — Offtaker PPA Annual Reconciliation & True-Up tab.
//
// 12-state P6 chain on oe_ppa_annual_recon. The annual financial-close gate
// of a PPA: year_opened → collect_data → classify_variance → compute_top_residual
// → apply_cpi_capacity → reconcile → (raise_dispute ⇄ resolve_dispute) →
// sign_off → invoice → settle → (restate_year escape door) + cancel_year.
// Aggregates W87 nominations, W32 take-or-pay residual, W39 CPI indexation,
// W46 deemed-energy credits, W54 payment-security activity, and capacity
// payment roll into ONE closed-year ledger with auditor + counterparty
// signoff. Tier RE-DERIVED on every transition from MAX(|variance|% band,
// top_residual_zar band) with FLOOR-AT-MATERIAL on four flags.
//
// Reportability (the W101 signature — IFRS 15 + NERSA s34 financial-close
// hard line): restate_year crosses regulator EVERY tier (post-signoff
// restatement); raise_dispute crosses EVERY tier (PPA disputes to NERSA s30);
// sign_off crosses material + major; cancel_year crosses EVERY tier when
// year had any delivery; SLA breaches cross material + major.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'year_opened' | 'data_collected' | 'variance_classified'
  | 'top_residual_computed' | 'cpi_capacity_applied' | 'reconciled'
  | 'disputed' | 'signed_off' | 'invoiced' | 'settled'
  | 'restated' | 'cancelled';

type Tier = 'minor' | 'standard' | 'material' | 'major';
type Urgency = 'critical' | 'high' | 'medium' | 'low';
type Authority = 'settlement_analyst' | 'finance_controller' | 'finance_director' | 'cfo';

interface ParRow {
  id: string;
  recon_number: string;
  ppa_id: string;
  ppa_name: string | null;
  buyer_party_id: string | null;
  buyer_party_name: string | null;
  seller_party_id: string | null;
  seller_party_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  contract_year: number;
  contract_year_label: string | null;
  contract_year_end_strict: number;
  year_period_start: string | null;
  year_period_end: string | null;
  contracted_mwh: number | null;
  delivered_mwh: number | null;
  metered_mwh: number | null;
  curtailed_mwh: number | null;
  variance_mwh: number | null;
  variance_pct: number | null;
  base_tariff_zar_per_mwh: number | null;
  indexed_tariff_zar_per_mwh: number | null;
  deviation_tariff_zar_per_mwh: number | null;
  deemed_tariff_zar_per_mwh: number | null;
  capacity_tariff_zar_per_mw_year: number | null;
  installed_capacity_mw: number | null;
  availability_factor_decimal: number | null;
  energy_revenue_zar: number | null;
  capacity_payment_zar: number | null;
  deemed_energy_credit_zar: number | null;
  cpi_true_up_zar: number | null;
  top_residual_zar: number | null;
  prior_year_overpayment_zar: number | null;
  net_cash_position_zar: number | null;
  min_offtake_mwh: number | null;
  offtake_shortfall_pct: number | null;
  top_residual_over_r100m: number;
  cpi_true_up_over_r50m: number;
  offtake_shortfall_over_20_pct: number;
  current_tier: Tier;
  authority_required: string | null;
  dispute_count: number;
  restate_count: number;
  year_had_delivery: number;
  parent_recon_id: string | null;
  prior_year_recon_id: string | null;
  regulator_ref: string | null;
  invoice_ref: string | null;
  payment_ref: string | null;
  ppa_contract_ref: string | null;
  title: string | null;
  narrative: string | null;
  result_text: string | null;
  disputed_reason: string | null;
  restated_reason: string | null;
  cancelled_reason: string | null;
  reason_code: string | null;
  chain_status: ChainStatus;
  year_opened_at: string | null;
  data_collected_at: string | null;
  variance_classified_at: string | null;
  top_residual_computed_at: string | null;
  cpi_capacity_applied_at: string | null;
  reconciled_at: string | null;
  disputed_at: string | null;
  signed_off_at: string | null;
  invoiced_at: string | null;
  settled_at: string | null;
  restated_at: string | null;
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
  floor_at_material_flag?: boolean;
  reconciliation_completeness_index_live?: number;
  top_residual_zar_live?: number;
  cpi_true_up_zar_live?: number;
  capacity_payment_year_zar_live?: number;
  deemed_energy_credit_zar_live?: number;
  net_cash_position_zar_live?: number;
  mwh_contracted_pct_delivered_live?: number;
  days_to_signoff_live?: number;
  sla_days_remaining_live?: number;
  urgency_band_live?: Urgency;
  predicted_year_close_date_live?: string | null;
  authority_required_live?: Authority;
  days_in_court_live?: number;
}

interface ParEvent {
  id: string;
  recon_id: string;
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
  signed_off_count: number;
  invoiced_count: number;
  reconciled_count: number;
  disputed_count: number;
  restated_count: number;
  cancelled_count: number;
  signoff_pending_count: number;
  breached: number;
  reportable_total: number;
  total_top_residual_zar: number;
  total_cpi_true_up_zar: number;
  total_deemed_energy_zar: number;
  total_capacity_payment_zar: number;
  total_net_cash_position_zar: number;
  avg_net_cash_position_zar: number;
  avg_completeness_index: number;
  critical_urgency_count: number;
  major_tier_count: number;
  floor_at_material_count: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  year_opened:           { bg: '#e3e7ec', fg: '#557',    label: 'Year opened' },
  data_collected:        { bg: '#dbecfb', fg: '#1a3a5c', label: 'Data collected' },
  variance_classified:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Variance classified' },
  top_residual_computed: { bg: '#fff4d6', fg: '#a06200', label: 'ToP residual' },
  cpi_capacity_applied:  { bg: '#fff4d6', fg: '#a06200', label: 'CPI + capacity' },
  reconciled:            { bg: '#daf5e2', fg: '#1f6b3a', label: 'Reconciled' },
  disputed:              { bg: '#ffe4e1', fg: '#a04040', label: 'Disputed' },
  signed_off:            { bg: '#daf5e2', fg: '#155724', label: 'Signed off' },
  invoiced:              { bg: '#dbecfb', fg: '#1a3a5c', label: 'Invoiced' },
  settled:               { bg: '#d4edda', fg: '#155724', label: 'Settled' },
  restated:              { bg: '#ede0e0', fg: '#6b3a3a', label: 'Restated' },
  cancelled:             { bg: '#ede0e0', fg: '#6b3a3a', label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
  standard: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard' },
  material: { bg: '#fff4d6', fg: '#8a4a00', label: 'Material' },
  major:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Major' },
};

const URGENCY_TONE: Record<Urgency, { bg: string; fg: string; label: string }> = {
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
  high:     { bg: '#ffe4b5', fg: '#a06200', label: 'High' },
  medium:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Medium' },
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
};

const AUTHORITY_LABEL: Record<Authority, string> = {
  settlement_analyst: 'Settlement analyst',
  finance_controller: 'Finance controller',
  finance_director:   'Finance director',
  cfo:                'CFO',
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
  { key: 'year_opened',           label: 'Year opened' },
  { key: 'data_collected',        label: 'Data' },
  { key: 'variance_classified',   label: 'Classified' },
  { key: 'top_residual_computed', label: 'ToP residual' },
  { key: 'cpi_capacity_applied',  label: 'CPI/capacity' },
  { key: 'reconciled',            label: 'Reconciled' },
  { key: 'disputed',              label: 'Disputed' },
  { key: 'signed_off',            label: 'Signed off' },
  { key: 'invoiced',              label: 'Invoiced' },
  { key: 'settled',               label: 'Settled' },
  { key: 'restated',              label: 'Restated' },
  { key: 'cancelled',             label: 'Cancelled' },
];

type ActionKind =
  | 'collect-data' | 'classify-variance' | 'compute-top-residual'
  | 'apply-cpi-capacity' | 'reconcile' | 'raise-dispute' | 'resolve-dispute'
  | 'sign-off' | 'invoice' | 'settle' | 'restate-year' | 'cancel-year';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  year_opened:           'collect-data',
  data_collected:        'classify-variance',
  variance_classified:   'compute-top-residual',
  top_residual_computed: 'apply-cpi-capacity',
  cpi_capacity_applied:  'reconcile',
  reconciled:            'sign-off',
  disputed:              'resolve-dispute',
  signed_off:            'invoice',
  invoiced:              'settle',
  settled:               null,
  restated:              null,
  cancelled:             null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'collect-data':         'Collect annual data (settlement analyst)',
  'classify-variance':    'Classify variance (settlement analyst)',
  'compute-top-residual': 'Compute take-or-pay residual (settlement analyst)',
  'apply-cpi-capacity':   'Apply CPI true-up + capacity roll (settlement analyst)',
  'reconcile':            'Reconcile annual ledger (settlement analyst)',
  'raise-dispute':        'Raise dispute → NERSA s30 (counterparty)',
  'resolve-dispute':      'Resolve dispute → back to reconciled',
  'sign-off':             'Sign off (finance controller + auditor + counterparty)',
  'invoice':              'Issue annual invoice',
  'settle':               'Mark settled (rest state — restate door stays open)',
  'restate-year':         'Restate year — IFRS 15 + NERSA s34 hard line',
  'cancel-year':          'Cancel year (pre-data abandonment)',
};

const TERMINAL_STATES: ChainStatus[] = ['settled', 'restated', 'cancelled'];
const CANCEL_FROM: ChainStatus[] = ['year_opened', 'data_collected'];

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
  if (Math.abs(n) >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}bn`;
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(1)}k`;
  return `R${Math.round(n)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(1)}%`;
}

export function PpaAnnualReconChainTab() {
  const [rows, setRows] = useState<ParRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active_open');
  const [selected, setSelected] = useState<ParRow | null>(null);
  const [events, setEvents] = useState<ParEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ParRow[] } & KpiSummary }>('/offtaker/ppa-annual-recon/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, settled_count: d.settled_count,
          signed_off_count: d.signed_off_count, invoiced_count: d.invoiced_count,
          reconciled_count: d.reconciled_count, disputed_count: d.disputed_count,
          restated_count: d.restated_count, cancelled_count: d.cancelled_count,
          signoff_pending_count: d.signoff_pending_count, breached: d.breached,
          reportable_total: d.reportable_total,
          total_top_residual_zar: d.total_top_residual_zar,
          total_cpi_true_up_zar: d.total_cpi_true_up_zar,
          total_deemed_energy_zar: d.total_deemed_energy_zar,
          total_capacity_payment_zar: d.total_capacity_payment_zar,
          total_net_cash_position_zar: d.total_net_cash_position_zar,
          avg_net_cash_position_zar: d.avg_net_cash_position_zar,
          avg_completeness_index: d.avg_completeness_index,
          critical_urgency_count: d.critical_urgency_count,
          major_tier_count: d.major_tier_count,
          floor_at_material_count: d.floor_at_material_count,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load PPA annual reconciliations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: ParRow; events: ParEvent[] } }>(`/offtaker/ppa-annual-recon/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load reconciliation history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')         return true;
      if (filter === 'active_open') return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'minor')       return r.current_tier === 'minor';
      if (filter === 'standard')    return r.current_tier === 'standard';
      if (filter === 'material')    return r.current_tier === 'material';
      if (filter === 'major')       return r.current_tier === 'major';
      if (filter === 'breached')    return !!r.sla_breached;
      if (filter === 'reportable')  return !!r.is_reportable_flag;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: ParRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'collect-data') {
        const contracted = window.prompt('Contracted energy for year (MWh):', String(row.contracted_mwh ?? ''));
        if (!contracted) return;
        const delivered = window.prompt('Delivered energy for year (MWh):', String(row.delivered_mwh ?? ''));
        const minOfftake = window.prompt('Minimum offtake / take-or-pay (MWh):', String(row.min_offtake_mwh ?? ''));
        const curtailed = window.prompt('Curtailed energy for year (MWh):', String(row.curtailed_mwh ?? '0'));
        body = { contracted_mwh: Number(contracted) };
        if (delivered)  body.delivered_mwh = Number(delivered);
        if (minOfftake) body.min_offtake_mwh = Number(minOfftake);
        if (curtailed)  body.curtailed_mwh = Number(curtailed);
      } else if (action === 'classify-variance') {
        const variance = window.prompt('Variance (MWh = delivered − contracted):', String(row.variance_mwh ?? ''));
        const pct = window.prompt('Variance %:', String(row.variance_pct ?? ''));
        const shortfall = window.prompt('Offtake shortfall %:', String(row.offtake_shortfall_pct ?? '0'));
        if (variance)  body.variance_mwh = Number(variance);
        if (pct)       body.variance_pct = Number(pct);
        if (shortfall) body.offtake_shortfall_pct = Number(shortfall);
      } else if (action === 'compute-top-residual') {
        const residual = window.prompt('Take-or-pay residual (ZAR):', String(row.top_residual_zar ?? ''));
        const overpay = window.prompt('Prior year overpayment to recover (ZAR):', String(row.prior_year_overpayment_zar ?? '0'));
        if (residual) body.top_residual_zar = Number(residual);
        if (overpay)  body.prior_year_overpayment_zar = Number(overpay);
      } else if (action === 'apply-cpi-capacity') {
        const cpi = window.prompt('CPI true-up (ZAR):', String(row.cpi_true_up_zar ?? ''));
        const cap = window.prompt('Capacity payment for year (ZAR):', String(row.capacity_payment_zar ?? ''));
        const deemed = window.prompt('Deemed-energy credit (ZAR):', String(row.deemed_energy_credit_zar ?? '0'));
        const energy = window.prompt('Energy revenue for year (ZAR):', String(row.energy_revenue_zar ?? ''));
        if (cpi)    body.cpi_true_up_zar = Number(cpi);
        if (cap)    body.capacity_payment_zar = Number(cap);
        if (deemed) body.deemed_energy_credit_zar = Number(deemed);
        if (energy) body.energy_revenue_zar = Number(energy);
      } else if (action === 'reconcile') {
        const net = window.prompt('Net cash position for year (ZAR):', String(row.net_cash_position_zar_live ?? row.net_cash_position_zar ?? ''));
        if (net) body.net_cash_position_zar = Number(net);
      } else if (action === 'raise-dispute') {
        const reason = window.prompt('Dispute reason (variance / tariff / curtailment / other):');
        if (!reason) return;
        const ref = window.prompt('NERSA s30 reference (if known):') || '';
        body = { disputed_reason: reason };
        if (ref) body.regulator_ref = ref;
      } else if (action === 'sign-off') {
        const auditor = window.prompt('Auditor confirming signoff:', 'PwC') || '';
        const counter = window.prompt('Counterparty confirming signoff:', row.seller_party_name ?? '') || '';
        if (auditor) body.auditor_party = auditor;
        if (counter) body.counterparty_party = counter;
      } else if (action === 'invoice') {
        const ref = window.prompt('Invoice reference:');
        if (!ref) return;
        body = { invoice_ref: ref };
      } else if (action === 'settle') {
        const ref = window.prompt('Payment reference:');
        if (!ref) return;
        body = { payment_ref: ref };
      } else if (action === 'restate-year') {
        const reason = window.prompt('Restatement reason (IFRS 15 + NERSA s34 disclosable):');
        if (!reason) return;
        const ref = window.prompt('NERSA inbox reference:') || '';
        body = { restated_reason: reason };
        if (ref) body.regulator_ref = ref;
      } else if (action === 'cancel-year') {
        const reason = window.prompt('Cancellation reason:');
        if (!reason) return;
        body = { cancelled_reason: reason };
      }
      await api.post(`/offtaker/ppa-annual-recon/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Offtaker PPA annual reconciliation &amp; true-up</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage P6 chain · year_opened → data_collected → variance_classified → top_residual_computed →
            cpi_capacity_applied → reconciled → signed_off → invoiced → settled (rest state · restate door open). Dispute
            branch loops via NERSA s30. Closes the annual financial year for every PPA: pulls in W87 nominations, W32
            take-or-pay annual residual, W39 CPI tariff indexation, W46 deemed-energy curtailment credits, W54 payment
            security, capacity payment annual roll into one signed-off ledger. INVERTED SLA (larger variance + residual =
            MORE time for forensic reconciliation, audit, counterparty signoff). Live annual-close battery surfaces
            reconciliation_completeness_index 0-130, top_residual ZAR, CPI true-up ZAR, capacity payment ZAR, deemed
            energy ZAR, net cash position ZAR, MWh contracted-vs-delivered %, days_to_signoff, urgency, predicted close
            date, and the authority required (settlement analyst → finance controller → finance director → CFO).
            Restating a settled year crosses to the regulator inbox for EVERY tier (IFRS 15 + NERSA s34 hard line);
            raising a dispute crosses to NERSA s30 for EVERY tier; signoff and SLA breaches cross for material + major;
            cancelling a year that had any delivery crosses for EVERY tier.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Signoff pending" value={kpis?.signoff_pending_count ?? 0} />
        <Kpi label="Signed off" value={kpis?.signed_off_count ?? 0} tone="ok" />
        <Kpi label="Invoiced" value={kpis?.invoiced_count ?? 0} tone="ok" />
        <Kpi label="Settled" value={kpis?.settled_count ?? 0} tone="ok" />
        <Kpi label="Disputed" value={kpis?.disputed_count ?? 0} tone={(kpis?.disputed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Restated" value={kpis?.restated_count ?? 0} tone={(kpis?.restated_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Cancelled" value={kpis?.cancelled_count ?? 0} />
        <Kpi label="Major tier" value={kpis?.major_tier_count ?? 0} tone={(kpis?.major_tier_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Critical urgency" value={kpis?.critical_urgency_count ?? 0} tone={(kpis?.critical_urgency_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Floor@material" value={kpis?.floor_at_material_count ?? 0} tone={(kpis?.floor_at_material_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Completeness avg" value={kpis ? kpis.avg_completeness_index.toFixed(1) : '—'} tone="ok" />
        <Kpi label="ToP residual total" value={fmtZar(kpis?.total_top_residual_zar)} tone="warn" />
        <Kpi label="CPI true-up total" value={fmtZar(kpis?.total_cpi_true_up_zar)} />
        <Kpi label="Capacity total" value={fmtZar(kpis?.total_capacity_payment_zar)} />
        <Kpi label="Deemed energy total" value={fmtZar(kpis?.total_deemed_energy_zar)} />
        <Kpi label="Net cash total" value={fmtZar(kpis?.total_net_cash_position_zar)} tone="ok" />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#0c2a4d] text-white'
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Recon #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Facility / seller</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Year</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">|Δ%|</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">ToP residual</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Net cash</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Urgency</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.current_tier];
                const urgency = r.urgency_band_live ? URGENCY_TONE[r.urgency_band_live] : null;
                const topRes = r.top_residual_zar_live ?? r.top_residual_zar;
                const netCash = r.net_cash_position_zar_live ?? r.net_cash_position_zar;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.recon_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                      {r.floor_at_material_flag && <span className="ml-1 text-[#a06200]" title="Floored at material">▲</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[260px] truncate" title={`${r.facility_name ?? ''} · ${r.seller_party_name ?? ''}`}>
                      {r.facility_name ?? r.ppa_name ?? '—'}
                      <span className="text-[#4a5568]"> · {r.seller_party_name ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568] font-mono text-[11px]">{r.contract_year_label ?? r.contract_year}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{fmtPct(r.variance_pct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#a06200]">{fmtZar(topRes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtZar(netCash)}</td>
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
                <tr><td colSpan={10} className="px-3 py-6 text-center text-[#4a5568]">No reconciliations match.</td></tr>
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
  row: ParRow;
  events: ParEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: ParRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canRaiseDispute = row.chain_status === 'reconciled';
  const canRestate = row.chain_status === 'settled';
  const canCancel = CANCEL_FROM.includes(row.chain_status);
  const authority = (row.authority_required_live ?? row.authority_required) as Authority | null;

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[820px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.recon_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.facility_name ?? row.ppa_name ?? '—'}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.current_tier].label} · year {row.contract_year_label ?? row.contract_year} ·
                seller {row.seller_party_name ?? '—'} · buyer {row.buyer_party_name ?? '—'}
              </div>
              {row.ppa_contract_ref && (
                <div className="mt-1 text-[11px] text-[#4a5568]">PPA {row.ppa_contract_ref}</div>
              )}
              {authority && AUTHORITY_LABEL[authority] && (
                <div className="mt-1 text-[11px] text-[#1a3a5c]">Authority required: {AUTHORITY_LABEL[authority]}</div>
              )}
              {row.regulator_ref && (
                <div className="mt-1 text-[11px] text-[#a04040]">NERSA: {row.regulator_ref}</div>
              )}
              {row.predicted_year_close_date_live && (
                <div className="mt-1 text-[11px] text-[#1a3a5c]">Predicted close: {fmtDate(row.predicted_year_close_date_live)}</div>
              )}
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Annual close battery</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Completeness index" value={row.reconciliation_completeness_index_live != null ? `${row.reconciliation_completeness_index_live}` : '—'} />
            <Pair label="Days to signoff"    value={row.days_to_signoff_live != null ? `${row.days_to_signoff_live.toFixed(1)}d` : '—'} />
            <Pair label="Days in court"      value={row.days_in_court_live != null ? `${row.days_in_court_live}d` : '—'} />
            <Pair label="SLA window"         value={fmtMinutes(row.sla_window_minutes)} />
            <Pair label="SLA days remaining" value={row.sla_days_remaining_live != null ? `${row.sla_days_remaining_live.toFixed(1)}d` : '—'} />
            <Pair label="Urgency"            value={row.urgency_band_live ? URGENCY_TONE[row.urgency_band_live].label : '—'} />
            <Pair label="ToP residual (live)"      value={fmtZar(row.top_residual_zar_live ?? row.top_residual_zar)} />
            <Pair label="CPI true-up (live)"       value={fmtZar(row.cpi_true_up_zar_live ?? row.cpi_true_up_zar)} />
            <Pair label="Capacity payment (live)"  value={fmtZar(row.capacity_payment_year_zar_live ?? row.capacity_payment_zar)} />
            <Pair label="Deemed energy (live)"     value={fmtZar(row.deemed_energy_credit_zar_live ?? row.deemed_energy_credit_zar)} />
            <Pair label="Net cash (live)"          value={fmtZar(row.net_cash_position_zar_live ?? row.net_cash_position_zar)} />
            <Pair label="MWh contracted%delivered" value={fmtPct(row.mwh_contracted_pct_delivered_live)} />
          </div>
        </section>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Year inputs</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Contracted MWh"   value={fmtMwh(row.contracted_mwh)} />
            <Pair label="Delivered MWh"    value={fmtMwh(row.delivered_mwh)} />
            <Pair label="Metered MWh"      value={fmtMwh(row.metered_mwh)} />
            <Pair label="Curtailed MWh"    value={fmtMwh(row.curtailed_mwh)} />
            <Pair label="Variance MWh"     value={fmtMwh(row.variance_mwh)} />
            <Pair label="Variance %"       value={fmtPct(row.variance_pct)} />
            <Pair label="Min offtake MWh"  value={fmtMwh(row.min_offtake_mwh)} />
            <Pair label="Offtake shortfall %" value={fmtPct(row.offtake_shortfall_pct)} />
            <Pair label="Installed MW"     value={row.installed_capacity_mw != null ? `${row.installed_capacity_mw} MW` : '—'} />
            <Pair label="Availability"     value={fmtPct(row.availability_factor_decimal != null ? row.availability_factor_decimal * 100 : null)} />
            <Pair label="Base tariff"      value={row.base_tariff_zar_per_mwh != null ? `R${row.base_tariff_zar_per_mwh.toFixed(0)}/MWh` : '—'} />
            <Pair label="Indexed tariff"   value={row.indexed_tariff_zar_per_mwh != null ? `R${row.indexed_tariff_zar_per_mwh.toFixed(0)}/MWh` : '—'} />
            <Pair label="Deviation tariff" value={row.deviation_tariff_zar_per_mwh != null ? `R${row.deviation_tariff_zar_per_mwh.toFixed(0)}/MWh` : '—'} />
            <Pair label="Deemed tariff"    value={row.deemed_tariff_zar_per_mwh != null ? `R${row.deemed_tariff_zar_per_mwh.toFixed(0)}/MWh` : '—'} />
            <Pair label="Capacity tariff"  value={row.capacity_tariff_zar_per_mw_year != null ? `R${(row.capacity_tariff_zar_per_mw_year / 1000).toFixed(0)}k/MW·yr` : '—'} />
            <Pair label="Energy revenue"   value={fmtZar(row.energy_revenue_zar)} />
            <Pair label="Prior overpayment" value={fmtZar(row.prior_year_overpayment_zar)} />
            <Pair label="Year-end strict"  value={row.contract_year_end_strict ? 'Yes (milestone)' : 'No'} />
          </div>
        </section>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Floor &amp; signoff flags</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="ToP &gt; R100m"          value={row.top_residual_over_r100m ? 'Yes — floor@material' : 'No'} />
            <Pair label="CPI true-up &gt; R50m"   value={row.cpi_true_up_over_r50m ? 'Yes — floor@material' : 'No'} />
            <Pair label="Shortfall &gt; 20%"      value={row.offtake_shortfall_over_20_pct ? 'Yes — floor@material' : 'No'} />
            <Pair label="Dispute count"           value={String(row.dispute_count)} />
            <Pair label="Restate count"           value={String(row.restate_count)} />
            <Pair label="Year had delivery"       value={row.year_had_delivery ? 'Yes' : 'No'} />
            <Pair label="Reportable"              value={row.is_reportable_flag ? 'Yes' : 'No'} />
            <Pair label="Breach crosses NERSA"    value={row.breach_crosses_regulator ? 'Yes' : 'No'} />
            <Pair label="Invoice ref"             value={row.invoice_ref ?? '—'} />
            <Pair label="Payment ref"             value={row.payment_ref ?? '—'} />
            <Pair label="Reason code"             value={row.reason_code ?? '—'} />
            <Pair label="Disputed reason"         value={row.disputed_reason ?? '—'} />
            <Pair label="Restated reason"         value={row.restated_reason ?? '—'} />
            <Pair label="Cancelled reason"        value={row.cancelled_reason ?? '—'} />
            <Pair label="Year opened"             value={fmtDate(row.year_opened_at)} />
            <Pair label="Data collected"          value={fmtDate(row.data_collected_at)} />
            <Pair label="Variance classified"     value={fmtDate(row.variance_classified_at)} />
            <Pair label="ToP residual computed"   value={fmtDate(row.top_residual_computed_at)} />
            <Pair label="CPI + capacity applied"  value={fmtDate(row.cpi_capacity_applied_at)} />
            <Pair label="Reconciled at"           value={fmtDate(row.reconciled_at)} />
            <Pair label="Disputed at"             value={fmtDate(row.disputed_at)} />
            <Pair label="Signed off at"           value={fmtDate(row.signed_off_at)} />
            <Pair label="Invoiced at"             value={fmtDate(row.invoiced_at)} />
            <Pair label="Settled at"              value={fmtDate(row.settled_at)} />
            <Pair label="Restated at"             value={fmtDate(row.restated_at)} />
            <Pair label="Cancelled at"            value={fmtDate(row.cancelled_at)} />
            <Pair label="SLA deadline"            value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"              value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"          value={String(row.escalation_level)} />
          </div>
          {row.narrative && <BasisBlock label="Narrative" tone="#1a3a5c" text={row.narrative} />}
          {row.result_text && <BasisBlock label="Result" tone="#557" text={row.result_text} />}
        </section>

        {(nextAction || canRaiseDispute || canRestate || canCancel) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[nextAction]}
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
              {canRestate && (
                <button type="button"
                  onClick={() => onAct('restate-year', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                  title="IFRS 15 + NERSA s34 — post-signoff restatement crosses regulator EVERY tier."
                >
                  {ACTION_LABEL['restate-year']}
                </button>
              )}
              {canCancel && (
                <button type="button"
                  onClick={() => onAct('cancel-year', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b3a3a] hover:bg-[#f3eded]"
                >
                  {ACTION_LABEL['cancel-year']}
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
