import React from 'react';
import { StatCard, StatGrid } from '../../components/display/StatCard';
import { DataTable, Column } from '../../components/display/DataTable';
import { StatusPill, stateVariant } from '../../components/display/StatusPill';
import { useOfftakerPpas, useOfftakerDeliveries, useOfftakerTariffs } from '../../lib/hooks';
import type { OfftakerPpa, OfftakerDelivery, OfftakerTariff } from '../../lib/client';

// ── Fallback Mock Data ────────────────────────────────────────────────────────

interface PpaRow {
  id: string;
  ppaRef: string;
  generator: string;
  contracted: string;
  delivered: string;
  shortfall: string;
  shortfallPct: number;
  cureWindow: string;
  tariff: string;
  monthlyInvoice: string;
  status: string;
}

const PPA_ROWS_FALLBACK: PpaRow[] = [
  { id: 'p1',  ppaRef: 'PPA-2019-001', generator: 'Sere Wind Farm',            contracted: '100',  delivered: '98,420',   shortfall: '1,580',  shortfallPct: 1.6,  cureWindow: '—',         tariff: 'R1.18', monthlyInvoice: 'R11.61', status: 'Active' },
  { id: 'p2',  ppaRef: 'PPA-2020-004', generator: 'Kathu Solar Park',           contracted: '75',   delivered: '68,100',   shortfall: '6,900',  shortfallPct: 9.2,  cureWindow: '14 days',   tariff: 'R1.31', monthlyInvoice: 'R8.92',  status: 'Cure Window' },
  { id: 'p3',  ppaRef: 'PPA-2021-007', generator: 'Cookhouse Wind',             contracted: '138',  delivered: '135,644',  shortfall: '2,356',  shortfallPct: 1.7,  cureWindow: '—',         tariff: 'R1.24', monthlyInvoice: 'R16.82', status: 'Active' },
  { id: 'p4',  ppaRef: 'PPA-2021-009', generator: 'De Aar Wind 2',              contracted: '90',   delivered: '84,200',   shortfall: '5,800',  shortfallPct: 6.4,  cureWindow: '21 days',   tariff: 'R1.22', monthlyInvoice: 'R10.27', status: 'Cure Window' },
  { id: 'p5',  ppaRef: 'PPA-2022-012', generator: 'Dreunberg Solar PV',         contracted: '175',  delivered: '174,200',  shortfall: '800',    shortfallPct: 0.5,  cureWindow: '—',         tariff: 'R1.19', monthlyInvoice: 'R20.73', status: 'Active' },
];

interface DeliveryRow {
  id: string;
  month: string;
  contracted: string;
  delivered: string;
  variance: string;
  varPct: string;
  varPositive: boolean;
  topLiability: string;
  deemedEnergy: string;
  isTotal: boolean;
}

const DELIVERY_ROWS_FALLBACK: DeliveryRow[] = [
  { id: 'd1',  month: 'Jun 2024',    contracted: '980',   delivered: '971',   variance: '-9',    varPct: '-0.9%',  varPositive: false, topLiability: 'R0.11', deemedEnergy: 'R0.00', isTotal: false },
  { id: 'd2',  month: 'Jul 2024',    contracted: '980',   delivered: '989',   variance: '+9',    varPct: '+0.9%',  varPositive: true,  topLiability: 'R0.00', deemedEnergy: 'R0.00', isTotal: false },
  { id: 'dt',  month: 'TOTAL',       contracted: '11,760', delivered: '11,650', variance: '-110', varPct: '-0.9%', varPositive: false, topLiability: 'R2.04', deemedEnergy: 'R0.62', isTotal: true  },
];

interface IndexationRow {
  id: string;
  ppaRef: string;
  baseTariff: string;
  cpiYear: string;
  escalation: string;
  newTariff: string;
  effectiveDate: string;
  nersaApproved: boolean;
  deltaValue: string;
}

const INDEXATION_ROWS_FALLBACK: IndexationRow[] = [
  { id: 'i1', ppaRef: 'PPA-2019-001', baseTariff: 'R1.08', cpiYear: '2024', escalation: '9.3%',  newTariff: 'R1.18', effectiveDate: '2025-01-01', nersaApproved: true,  deltaValue: 'R1.21' },
  { id: 'i2', ppaRef: 'PPA-2020-004', baseTariff: 'R1.19', cpiYear: '2024', escalation: '10.1%', newTariff: 'R1.31', effectiveDate: '2025-01-01', nersaApproved: true,  deltaValue: 'R1.44' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const MONO: React.CSSProperties = { fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' };

function shortfallColor(pct: number): string {
  if (pct > 5) return 'var(--oe-rose)';
  if (pct > 2) return 'var(--oe-amber)';
  return 'var(--oe-green)';
}

function fmtR(n: number): string {
  return `R${n.toFixed(2)}`;
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-ZA', { maximumFractionDigits: 0 });
}

function fmtZarM(n: number): string {
  return `R${(n / 1_000_000).toFixed(2)}M`;
}

// ── Live data mappers ────────────────────────────────────────────────────────

function mapPpaRow(p: OfftakerPpa): PpaRow {
  const shortfallPct = p.shortfall_pct ?? 0;
  const cureWindow = p.cure_window_days != null && p.cure_window_days > 0
    ? `${p.cure_window_days} days`
    : '—';
  const monthlyInvoice = p.monthly_invoice_zar != null
    ? fmtZarM(p.monthly_invoice_zar)
    : '—';
  return {
    id: p.id,
    ppaRef: p.ppa_ref,
    generator: p.generator_name,
    contracted: String(p.contracted_mw),
    delivered: p.delivered_mwh != null ? fmtNum(p.delivered_mwh) : '—',
    shortfall: p.shortfall_mwh != null ? fmtNum(p.shortfall_mwh) : '—',
    shortfallPct,
    cureWindow,
    tariff: fmtR(p.tariff_per_kwh),
    monthlyInvoice,
    status: p.status,
  };
}

function mapDeliveryRow(d: OfftakerDelivery, idx: number): DeliveryRow {
  const varPositive = d.variance_gwh >= 0;
  const varSign = varPositive ? '+' : '';
  return {
    id: `d-live-${idx}`,
    month: d.month,
    contracted: fmtNum(d.contracted_gwh),
    delivered: fmtNum(d.delivered_gwh),
    variance: `${varSign}${fmtNum(d.variance_gwh)}`,
    varPct: `${varSign}${d.variance_pct.toFixed(1)}%`,
    varPositive,
    topLiability: d.top_liability_zar != null ? fmtZarM(d.top_liability_zar) : 'R0.00',
    deemedEnergy: d.deemed_energy_zar != null ? fmtZarM(d.deemed_energy_zar) : 'R0.00',
    isTotal: false,
  };
}

function mapIndexationRow(t: OfftakerTariff): IndexationRow {
  return {
    id: t.id,
    ppaRef: t.ppa_ref,
    baseTariff: fmtR(t.base_tariff),
    cpiYear: String(t.cpi_year),
    escalation: `${t.escalation_pct.toFixed(1)}%`,
    newTariff: fmtR(t.new_tariff),
    effectiveDate: t.effective_date,
    nersaApproved: t.nersa_approved,
    deltaValue: t.delta_value_zar != null ? fmtZarM(t.delta_value_zar) : '—',
  };
}

// ── Column definitions ───────────────────────────────────────────────────────
const PPA_COLS: Column<PpaRow>[] = [
  { key: 'ppaRef',       header: 'PPA Ref',             width: '120px', mono: true },
  { key: 'generator',    header: 'Generator',           width: '180px' },
  { key: 'contracted',   header: 'Contracted (MW)',     width: '120px', align: 'right', mono: true },
  { key: 'delivered',    header: 'Delivered (MWh)',     width: '130px', align: 'right', mono: true },
  { key: 'shortfall',    header: 'Shortfall (MWh)',     width: '120px', align: 'right', mono: true },
  { key: 'shortfallPct', header: 'Shortfall %',         width: '100px', align: 'right',
    render: (r) => (
      <span style={{ ...MONO, fontWeight: 600, color: shortfallColor(r.shortfallPct) }}>
        {r.shortfallPct.toFixed(1)}%
      </span>
    )},
  { key: 'cureWindow',   header: 'Cure Window',         width: '100px', align: 'center' },
  { key: 'tariff',       header: 'Tariff (R/kWh)',      width: '110px', align: 'right', mono: true },
  { key: 'monthlyInvoice', header: 'Monthly Invoice (ZAR M)', width: '160px', align: 'right', mono: true },
  { key: 'status',       header: 'Status',              width: '110px',
    render: (r) => <StatusPill label={r.status} variant={stateVariant(r.status)} /> },
];

const DELIVERY_COLS: Column<DeliveryRow>[] = [
  { key: 'month',       header: 'Month',                   width: '100px',
    render: (r) => (
      <span style={{ fontWeight: r.isTotal ? 700 : 400, color: 'var(--oe-text-1)' }}>{r.month}</span>
    )},
  { key: 'contracted',  header: 'Contracted (GWh)',        width: '140px', align: 'right', mono: true },
  { key: 'delivered',   header: 'Delivered',               width: '100px', align: 'right', mono: true },
  { key: 'variance',    header: 'Variance',                width: '90px',  align: 'right',
    render: (r) => (
      <span style={{ ...MONO, fontWeight: 600, color: r.varPositive ? 'var(--oe-green)' : 'var(--oe-rose)' }}>
        {r.variance}
      </span>
    )},
  { key: 'varPct',      header: 'Var %',                   width: '80px',  align: 'right',
    render: (r) => (
      <span style={{ ...MONO, fontWeight: 600, color: r.varPositive ? 'var(--oe-green)' : 'var(--oe-rose)' }}>
        {r.varPct}
      </span>
    )},
  { key: 'topLiability',  header: 'ToP Liability (ZAR M)', width: '150px', align: 'right', mono: true },
  { key: 'deemedEnergy',  header: 'Deemed Energy (ZAR M)', width: '150px', align: 'right', mono: true },
];

const INDEXATION_COLS: Column<IndexationRow>[] = [
  { key: 'ppaRef',        header: 'PPA Ref',            width: '120px', mono: true },
  { key: 'baseTariff',    header: 'Base Tariff',        width: '100px', align: 'right', mono: true },
  { key: 'cpiYear',       header: 'CPI Year',           width: '80px',  align: 'center', mono: true },
  { key: 'escalation',    header: 'Escalation %',       width: '110px', align: 'right', mono: true },
  { key: 'newTariff',     header: 'New Tariff',         width: '100px', align: 'right', mono: true },
  { key: 'effectiveDate', header: 'Effective Date',     width: '120px', mono: true },
  { key: 'nersaApproved', header: 'NERSA Approved',     width: '120px', align: 'center',
    render: (r) => (
      <span style={{ ...MONO, fontWeight: 600, color: r.nersaApproved ? 'var(--oe-green)' : 'var(--oe-rose)' }}>
        {r.nersaApproved ? 'Yes' : 'No'}
      </span>
    )},
  { key: 'deltaValue',    header: 'Delta Value (ZAR M/yr)', width: '160px', align: 'right', mono: true },
];

// ── Section header helper ────────────────────────────────────────────────────
const sectionHeader = (title: string, label: string): React.ReactElement => (
  <div
    style={{
      background: 'var(--oe-surf)',
      borderBottom: '1px solid var(--oe-border)',
      padding: '10px 16px',
      marginBottom: '12px',
    }}
  >
    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
      {label}
    </div>
    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--oe-text-1)' }}>{title}</div>
  </div>
);

// ── Component ────────────────────────────────────────────────────────────────
export function OfftakerAnalytics() {
  const { data: ppas, loading: ppasLoading } = useOfftakerPpas();
  const { data: deliveries, loading: deliveriesLoading } = useOfftakerDeliveries();
  const { data: tariffs, loading: tariffsLoading } = useOfftakerTariffs();

  // KPI computations from live data
  const totalContractedMw = ppas.length > 0
    ? ppas.reduce((sum, p) => sum + p.contracted_mw, 0)
    : 1240;

  const avgTariff = ppas.length > 0
    ? (ppas.reduce((sum, p) => sum + p.tariff_per_kwh, 0) / ppas.length)
    : 1.24;

  const cureWindowCount = ppas.length > 0
    ? ppas.filter(p => (p.cure_window_days ?? 0) > 0).length
    : 2;

  const totalShortfallMwh = deliveries.length > 0
    ? deliveries.reduce((sum, d) => sum + Math.abs(Math.min(d.variance_gwh, 0)) * 1000, 0)
    : 0;

  const deliveredMwh = deliveries.length > 0
    ? deliveries.reduce((sum, d) => sum + d.delivered_gwh, 0) * 1000
    : 0;

  const contractedMwh = deliveries.length > 0
    ? deliveries.reduce((sum, d) => sum + d.contracted_gwh, 0) * 1000
    : 0;

  const deliveryRatePct = contractedMwh > 0
    ? ((deliveredMwh / contractedMwh) * 100)
    : 96.4;

  // Mapped live rows (fall back to static if empty)
  const ppaRows: PpaRow[] = ppas.length > 0
    ? ppas.map(mapPpaRow)
    : PPA_ROWS_FALLBACK;

  const deliveryRowsRaw: DeliveryRow[] = deliveries.length > 0
    ? deliveries.map(mapDeliveryRow)
    : DELIVERY_ROWS_FALLBACK;

  // Append totals row when using live data
  const deliveryRows: DeliveryRow[] = deliveries.length > 0
    ? [
        ...deliveryRowsRaw,
        {
          id: 'dt-live',
          month: 'TOTAL',
          contracted: fmtNum(deliveries.reduce((s, d) => s + d.contracted_gwh, 0)),
          delivered: fmtNum(deliveries.reduce((s, d) => s + d.delivered_gwh, 0)),
          variance: (() => {
            const v = deliveries.reduce((s, d) => s + d.variance_gwh, 0);
            return `${v >= 0 ? '+' : ''}${fmtNum(v)}`;
          })(),
          varPct: (() => {
            const totalC = deliveries.reduce((s, d) => s + d.contracted_gwh, 0);
            const totalV = deliveries.reduce((s, d) => s + d.variance_gwh, 0);
            const pct = totalC > 0 ? (totalV / totalC) * 100 : 0;
            return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
          })(),
          varPositive: deliveries.reduce((s, d) => s + d.variance_gwh, 0) >= 0,
          topLiability: fmtZarM(deliveries.reduce((s, d) => s + (d.top_liability_zar ?? 0), 0)),
          deemedEnergy: fmtZarM(deliveries.reduce((s, d) => s + (d.deemed_energy_zar ?? 0), 0)),
          isTotal: true,
        },
      ]
    : DELIVERY_ROWS_FALLBACK;

  const indexationRows: IndexationRow[] = tariffs.length > 0
    ? tariffs.map(mapIndexationRow)
    : INDEXATION_ROWS_FALLBACK;

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* Page title */}
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0, letterSpacing: '-0.02em' }}>
          PPA Portfolio Analytics
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--oe-text-3)', marginTop: '4px' }}>
          Live offtake register — NERSA Section 34 · IFRS 16 · REIPPPP
        </p>
      </div>

      {/* KPI Row */}
      <StatGrid cols={5}>
        <StatCard
          label="Total Contracted"
          value={ppasLoading ? '…' : String(totalContractedMw)}
          unit="MW"
          variant="navy"
          icon="lightning"
        />
        <StatCard
          label="YTD Delivery Rate"
          value={deliveriesLoading ? '…' : deliveryRatePct.toFixed(1)}
          unit="%"
          variant="green"
          icon="check-circle"
        />
        <StatCard
          label="PPA Tariff Avg"
          value={ppasLoading ? '…' : `R${avgTariff.toFixed(2)}`}
          unit="/kWh"
          variant="blue"
          icon="dollar"
        />
        <StatCard
          label="Outstanding Cure Windows"
          value={ppasLoading ? '…' : String(cureWindowCount)}
          variant="amber"
          icon="clock"
        />
        <StatCard
          label="Take-or-Pay Exposure"
          value={deliveriesLoading ? '…' : totalShortfallMwh > 0 ? fmtZarM(totalShortfallMwh * avgTariff * 1000) : 'R0'}
          variant="rose"
          icon="alert-triangle"
        />
      </StatGrid>

      {/* PPA Performance Table */}
      <div>
        {sectionHeader('PPA Performance Table', 'Offtake Agreements')}
        <DataTable
          columns={PPA_COLS}
          rows={ppaRows}
          compact
          stickyHeader
        />
      </div>

      {/* Monthly Delivery vs Contract */}
      <div>
        {sectionHeader('Monthly Delivery vs Contract', '12-Month Delivery Ledger')}
        <DataTable
          columns={DELIVERY_COLS}
          rows={deliveryRows}
          compact
          stickyHeader
        />
      </div>

      {/* Tariff Indexation History */}
      <div>
        {sectionHeader('Tariff Indexation History', 'CPI Escalation Log')}
        <DataTable
          columns={INDEXATION_COLS}
          rows={indexationRows}
          compact
          stickyHeader
        />
      </div>

    </div>
  );
}

export default OfftakerAnalytics;
