import React from 'react';
import { StatCard, StatGrid } from '../../components/display/StatCard';
import { DataTable, Column } from '../../components/display/DataTable';
import { StatusPill, stateVariant } from '../../components/display/StatusPill';
import { useGridNominations, useGridCurtailments, useGridReserveActivations } from '../../lib/hooks';
import type { GridNomination, GridCurtailment, GridReserveActivation } from '../../lib/client';

// ─── Fallback Mock Data ───────────────────────────────────────────────────────

interface NominationRow {
  id: string;
  date: string;
  brp: string;
  energyType: string;
  nominated: number;
  dispatched: number;
  deviation: number;
  deviationPct: number;
  reservePenalty: number;
  status: string;
}

const NOMINATIONS_FALLBACK: NominationRow[] = [
  { id: 'n1',  date: '2026-05-28', brp: 'Eskom BRP-01',  energyType: 'Solar PV',   nominated: 240, dispatched: 238, deviation: -2,  deviationPct: 0.8,  reservePenalty:       0, status: 'Settled'  },
  { id: 'n2',  date: '2026-05-28', brp: 'SunCo Energy',  energyType: 'Wind',        nominated: 185, dispatched: 179, deviation: -6,  deviationPct: 3.2,  reservePenalty:  42000, status: 'Settled'  },
  { id: 'n3',  date: '2026-05-27', brp: 'NorthWind Ltd', energyType: 'Wind',        nominated: 310, dispatched: 284, deviation: -26, deviationPct: 8.4,  reservePenalty: 185000, status: 'Disputed' },
];

interface CurtailmentRow {
  id: string;
  eventRef: string;
  date: string;
  stage: number;
  affectedZone: string;
  shedMw: number;
  durationMin: number;
  cause: string;
  compensationZarM: number;
  status: string;
}

const CURTAILMENTS_FALLBACK: CurtailmentRow[] = [
  { id: 'c1',  eventRef: 'CUR-2026-0511', date: '2026-05-15', stage: 2, affectedZone: 'Cape Town Metro',  shedMw: 180, durationMin: 120, cause: 'Generation shortfall',   compensationZarM: 2.1, status: 'Settled'   },
  { id: 'c2',  eventRef: 'CUR-2026-0510', date: '2026-05-14', stage: 4, affectedZone: 'Johannesburg N',   shedMw: 340, durationMin: 240, cause: 'Transmission fault',     compensationZarM: 8.4, status: 'Disputed'  },
  { id: 'c3',  eventRef: 'CUR-2026-0509', date: '2026-05-12', stage: 1, affectedZone: 'Durban Metro',     shedMw:  90, durationMin:  90, cause: 'Reserve deficiency',    compensationZarM: 0.7, status: 'Settled'   },
];

interface ReserveRow {
  id: string;
  activationRef: string;
  type: string;
  dateTime: string;
  provider: string;
  contracted: number;
  delivered: number;
  responseTimeSec: number;
  settlementZar: number;
  hasPenalty: boolean;
  status: string;
}

const RESERVES_FALLBACK: ReserveRow[] = [
  { id: 'r1',  activationRef: 'RES-2026-0245', type: 'Regulating Reserve', dateTime: '2026-05-28 14:32',  provider: 'BESS-SA 01',    contracted: 80,  delivered: 80,  responseTimeSec:  4.1, settlementZar:  184000, hasPenalty: false, status: 'Settled'   },
  { id: 'r2',  activationRef: 'RES-2026-0244', type: 'Spinning Reserve',   dateTime: '2026-05-27 09:15',  provider: 'GreenGen PSA',  contracted: 120, delivered: 112, responseTimeSec:  7.8, settlementZar:  241000, hasPenalty: true,  status: 'Settled'   },
];

interface MonthlyRow {
  id: string;
  month: string;
  availabilityPct: number;
  peakLoadMw: number;
  minReservePct: number;
  curtailmentEvents: number;
  unservedEnergyMwh: number;
  compensationZarM: number;
}

const MONTHLY_AVAIL: MonthlyRow[] = [
  { id: 'm1', month: 'Dec 2025', availabilityPct: 99.4, peakLoadMw: 32800, minReservePct: 22.1, curtailmentEvents: 1, unservedEnergyMwh:   480, compensationZarM:  0.9 },
  { id: 'm2', month: 'Jan 2026', availabilityPct: 98.2, peakLoadMw: 34200, minReservePct: 17.8, curtailmentEvents: 3, unservedEnergyMwh:  1840, compensationZarM:  5.2 },
  { id: 'm3', month: 'Feb 2026', availabilityPct: 97.6, peakLoadMw: 33100, minReservePct: 15.4, curtailmentEvents: 4, unservedEnergyMwh:  2210, compensationZarM:  7.8 },
  { id: 'm4', month: 'Mar 2026', availabilityPct: 94.1, peakLoadMw: 35600, minReservePct: 11.2, curtailmentEvents: 8, unservedEnergyMwh:  6820, compensationZarM: 24.1 },
  { id: 'm5', month: 'Apr 2026', availabilityPct: 99.1, peakLoadMw: 31900, minReservePct: 20.6, curtailmentEvents: 2, unservedEnergyMwh:   870, compensationZarM:  2.4 },
  { id: 'm6', month: 'May 2026', availabilityPct: 99.3, peakLoadMw: 31200, minReservePct: 18.4, curtailmentEvents: 8, unservedEnergyMwh:  3140, compensationZarM: 10.7 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' };

// ─── Live data mappers ────────────────────────────────────────────────────────

function mapNominationRow(n: GridNomination): NominationRow {
  const deviation = (n.deviation_mw ?? 0);
  const deviationPct = (n.deviation_pct ?? 0);
  return {
    id: n.id,
    date: n.date,
    brp: n.brp,
    energyType: n.energy_type,
    nominated: n.nominated_mw,
    dispatched: n.dispatched_mw ?? 0,
    deviation,
    deviationPct: Math.abs(deviationPct),
    reservePenalty: n.reserve_penalty_zar ?? 0,
    status: n.status,
  };
}

function mapCurtailmentRow(c: GridCurtailment): CurtailmentRow {
  return {
    id: c.id,
    eventRef: c.event_ref,
    date: c.event_date,
    stage: c.stage,
    affectedZone: c.affected_zone,
    shedMw: c.shed_mw,
    durationMin: c.duration_min,
    cause: c.cause,
    compensationZarM: c.compensation_zar != null ? c.compensation_zar / 1_000_000 : 0,
    status: c.status,
  };
}

function mapReserveRow(r: GridReserveActivation): ReserveRow {
  return {
    id: r.id,
    activationRef: r.activation_ref,
    type: r.reserve_type,
    dateTime: r.activation_datetime,
    provider: r.provider,
    contracted: r.contracted_mw,
    delivered: r.delivered_mw ?? 0,
    responseTimeSec: r.response_time_s ?? 0,
    settlementZar: r.settlement_zar ?? 0,
    hasPenalty: r.penalty_applied,
    status: r.status,
  };
}

// ─── Column definitions ───────────────────────────────────────────────────────

const nomCols: Column<NominationRow>[] = [
  { key: 'date',           header: 'Date',               sortable: true },
  { key: 'brp',            header: 'BRP',                sortable: true },
  { key: 'energyType',     header: 'Energy Type' },
  { key: 'nominated',      header: 'Nominated (MW)',     align: 'right', mono: true },
  { key: 'dispatched',     header: 'Dispatched (MW)',    align: 'right', mono: true },
  {
    key: 'deviation',
    header: 'Deviation (MW)',
    align: 'right',
    render: (row) => {
      const color = Math.abs(row.deviationPct) > 5
        ? 'var(--oe-rose)'
        : Math.abs(row.deviationPct) > 2
          ? 'var(--oe-amber)'
          : 'var(--oe-text-1)';
      return <span style={{ ...MONO, color }}>{row.deviation > 0 ? '+' : ''}{row.deviation}</span>;
    },
  },
  {
    key: 'deviationPct',
    header: 'Dev %',
    align: 'right',
    render: (row) => {
      const color = row.deviationPct > 5
        ? 'var(--oe-rose)'
        : row.deviationPct > 2
          ? 'var(--oe-amber)'
          : 'var(--oe-green)';
      return <span style={{ ...MONO, color }}>{row.deviationPct.toFixed(1)}%</span>;
    },
  },
  {
    key: 'reservePenalty',
    header: 'Reserve Penalty (ZAR)',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: row.reservePenalty > 0 ? 'var(--oe-rose)' : 'var(--oe-text-3)' }}>
        {row.reservePenalty > 0 ? `R ${row.reservePenalty.toLocaleString()}` : '—'}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} />,
  },
];

const curtCols: Column<CurtailmentRow>[] = [
  { key: 'eventRef',        header: 'Event Ref',          sortable: true },
  { key: 'date',            header: 'Date',               sortable: true },
  {
    key: 'stage',
    header: 'Stage',
    align: 'center',
    render: (row) => (
      <span style={{ ...MONO, color: row.stage >= 4 ? 'var(--oe-rose)' : 'var(--oe-text-1)', fontWeight: row.stage >= 4 ? 700 : 400 }}>
        Stage {row.stage}
      </span>
    ),
  },
  { key: 'affectedZone',    header: 'Affected Zone' },
  { key: 'shedMw',          header: 'Shed (MW)',          align: 'right', mono: true },
  { key: 'durationMin',     header: 'Duration (min)',     align: 'right', mono: true },
  { key: 'cause',           header: 'Cause' },
  {
    key: 'compensationZarM',
    header: 'Compensation (ZAR M)',
    align: 'right',
    render: (row) => <span style={MONO}>R {row.compensationZarM.toFixed(1)}M</span>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} />,
  },
];

const resCols: Column<ReserveRow>[] = [
  { key: 'activationRef',   header: 'Activation Ref',    sortable: true },
  { key: 'type',            header: 'Type' },
  { key: 'dateTime',        header: 'Date / Time',       sortable: true },
  { key: 'provider',        header: 'Provider' },
  { key: 'contracted',      header: 'Contracted (MW)',   align: 'right', mono: true },
  { key: 'delivered',       header: 'Delivered (MW)',    align: 'right', mono: true },
  {
    key: 'responseTimeSec',
    header: 'Response Time (s)',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: row.responseTimeSec > 10 ? 'var(--oe-rose)' : 'var(--oe-green)' }}>
        {row.responseTimeSec.toFixed(1)}s
      </span>
    ),
  },
  {
    key: 'settlementZar',
    header: 'Settlement (ZAR)',
    align: 'right',
    render: (row) => <span style={MONO}>R {row.settlementZar.toLocaleString()}</span>,
  },
  {
    key: 'hasPenalty',
    header: 'Penalty',
    align: 'center',
    render: (row) => (
      <span style={{ ...MONO, color: row.hasPenalty ? 'var(--oe-rose)' : 'var(--oe-green)', fontWeight: 600, fontSize: '11px' }}>
        {row.hasPenalty ? 'YES' : 'NO'}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} />,
  },
];

const monthlyCols: Column<MonthlyRow>[] = [
  { key: 'month', header: 'Month', sortable: true },
  {
    key: 'availabilityPct',
    header: 'System Availability %',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: row.availabilityPct < 95 ? 'var(--oe-rose)' : row.availabilityPct < 99 ? 'var(--oe-amber)' : 'var(--oe-green)' }}>
        {row.availabilityPct.toFixed(1)}%
      </span>
    ),
  },
  {
    key: 'peakLoadMw',
    header: 'Peak Load (MW)',
    align: 'right',
    render: (row) => <span style={MONO}>{row.peakLoadMw.toLocaleString()}</span>,
  },
  {
    key: 'minReservePct',
    header: 'Min Reserve %',
    align: 'right',
    render: (row) => <span style={{ ...MONO, color: row.minReservePct < 15 ? 'var(--oe-rose)' : 'var(--oe-text-1)' }}>{row.minReservePct.toFixed(1)}%</span>,
  },
  { key: 'curtailmentEvents',  header: 'Curtailment Events', align: 'right', mono: true },
  {
    key: 'unservedEnergyMwh',
    header: 'Unserved Energy (MWh)',
    align: 'right',
    render: (row) => <span style={MONO}>{row.unservedEnergyMwh.toLocaleString()}</span>,
  },
  {
    key: 'compensationZarM',
    header: 'Compensation (ZAR M)',
    align: 'right',
    render: (row) => <span style={MONO}>R {row.compensationZarM.toFixed(1)}M</span>,
  },
];

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHead({ label, title }: { label: string; title: string }) {
  return (
    <div
      style={{
        background: 'var(--oe-surf)',
        border: '1px solid var(--oe-border)',
        borderRadius: 'var(--oe-r-card)',
        padding: '10px 16px 12px',
        borderBottom: '2px solid var(--oe-border)',
      }}
    >
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--oe-text-1)', marginTop: '2px' }}>{title}</div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GridAnalytics() {
  const { data: nominations, loading: nominationsLoading } = useGridNominations();
  const { data: curtailments, loading: curtailmentsLoading } = useGridCurtailments();
  const { data: reserveActs, loading: reserveActsLoading } = useGridReserveActivations();

  // KPI computations
  const activeCurtailments = curtailments.length > 0
    ? curtailments.filter(c => !/settled|closed/i.test(c.status)).length
    : 8;

  const totalShedMw = curtailments.length > 0
    ? curtailments.reduce((sum, c) => sum + c.shed_mw, 0)
    : 0;

  const pendingNominations = nominations.length > 0
    ? nominations.filter(n => !/settled|confirmed/i.test(n.status)).length
    : 0;

  const reserveActsCount = reserveActs.length > 0
    ? reserveActs.length
    : 10;

  // Mapped live rows
  const nominationRows: NominationRow[] = nominations.length > 0
    ? nominations.map(mapNominationRow)
    : NOMINATIONS_FALLBACK;

  const curtailmentRows: CurtailmentRow[] = curtailments.length > 0
    ? curtailments.map(mapCurtailmentRow)
    : CURTAILMENTS_FALLBACK;

  const reserveRows: ReserveRow[] = reserveActs.length > 0
    ? reserveActs.map(mapReserveRow)
    : RESERVES_FALLBACK;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '24px' }}>
      {/* Page title */}
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0 }}>
          Grid Operations Analytics
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--oe-text-3)', margin: '4px 0 0' }}>
          Live system metrics — Dispatch, Curtailment, Reserve &amp; Availability
        </p>
      </div>

      {/* KPI row */}
      <StatGrid cols={5}>
        <StatCard label="System Frequency" value="50.01" unit="Hz"  variant="green" icon="lightning" subtext="±0.02 Hz from nominal" />
        <StatCard label="Reserve Margin"   value="18.4"  unit="%"   variant="green" icon="bar-chart" subtext="Above 15% threshold"  />
        <StatCard
          label="Pending Nominations"
          value={nominationsLoading ? '…' : String(pendingNominations)}
          variant={pendingNominations > 5 ? 'amber' : 'green'}
          icon="checklist"
          subtext="Awaiting confirmation"
        />
        <StatCard
          label="Active Curtailments"
          value={curtailmentsLoading ? '…' : String(activeCurtailments)}
          unit={totalShedMw > 0 ? `${totalShedMw.toLocaleString()} MW shed` : undefined}
          variant={activeCurtailments > 3 ? 'rose' : 'amber'}
          icon="alert-triangle"
          subtext={curtailments.filter(c => /disputed/i.test(c.status)).length > 0
            ? `${curtailments.filter(c => /disputed/i.test(c.status)).length} disputed`
            : 'Last 30 days'}
        />
        <StatCard
          label="Reserve Activations"
          value={reserveActsLoading ? '…' : String(reserveActsCount)}
          variant="green"
          icon="chart-line"
          subtext="All BRPs"
        />
      </StatGrid>

      {/* Dispatch Nominations Performance */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <SectionHead label="Dispatch" title="Nomination Performance — Last 15 Periods" />
        <DataTable<NominationRow> columns={nomCols} rows={nominationRows} compact />
      </div>

      {/* Load Curtailment Events */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <SectionHead label="Curtailment" title="Load Curtailment Events — Last 30 Days" />
        <DataTable<CurtailmentRow> columns={curtCols} rows={curtailmentRows} compact />
      </div>

      {/* Reserve Activation History */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <SectionHead label="Ancillary Services" title="Reserve Activation History" />
        <DataTable<ReserveRow> columns={resCols} rows={reserveRows} compact />
      </div>

      {/* Monthly Availability Summary (static trend) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <SectionHead label="Availability" title="Monthly System Availability Summary — 6 Months" />
        <DataTable<MonthlyRow> columns={monthlyCols} rows={MONTHLY_AVAIL} compact />
      </div>
    </div>
  );
}

export default GridAnalytics;
