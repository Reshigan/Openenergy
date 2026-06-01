import React from 'react';
import { StatCard, StatGrid } from '../../components/display/StatCard';
import { DataTable, Column } from '../../components/display/DataTable';
import { StatusPill, stateVariant } from '../../components/display/StatusPill';
import { useIppEvm, useIppBonds, useIppStageGates } from '../../lib/hooks';
import { IppEvm, IppBond, IppStageGate } from '../../lib/client';

// ── Mock data ────────────────────────────────────────────────────────────────

interface EvmRow {
  id: string;
  project: string;
  bac: number;
  ev: number;
  ac: number;
  spi: number;
  cpi: number;
  eac: number;
  vac: number;
  status: string;
}

const EVM_FALLBACK: EvmRow[] = [
  { id: '1', project: 'Boegoesberg Wind 140MW',    bac: 2840, ev: 2612, ac: 2740, spi: 0.92, cpi: 0.95, eac: 2989, vac: -149, status: 'construction' },
  { id: '2', project: 'Loeriesfontein Solar 80MW',  bac: 1560, ev: 1607, ac: 1580, spi: 1.03, cpi: 1.02, eac: 1529, vac:   31, status: 'commissioning' },
  { id: '3', project: 'Cookhouse BESS 50MWh',       bac:  920, ev:  782, ac:  830, spi: 0.85, cpi: 0.94, eac:  979, vac:  -59, status: 'construction' },
  { id: '4', project: 'Saldanha Bay Offshore 200MW', bac: 5200, ev: 4940, ac: 4880, spi: 0.95, cpi: 1.01, eac: 5149, vac:   51, status: 'construction' },
  { id: '5', project: 'Upington Solar PV 120MW',    bac: 2100, ev: 2163, ac: 2090, spi: 1.03, cpi: 1.04, eac: 2019, vac:   81, status: 'commissioned' },
  { id: '6', project: 'Klipheuwel Wind 60MW',       bac: 1180, ev:  943, ac: 1020, spi: 0.80, cpi: 0.92, eac: 1283, vac: -103, status: 'at_risk' },
  { id: '7', project: 'De Aar Solar 150MW',         bac: 2650, ev: 2570, ac: 2520, spi: 0.97, cpi: 1.02, eac: 2598, vac:   52, status: 'construction' },
  { id: '8', project: 'Beaufort West BESS 30MWh',   bac:  640, ev:  646, ac:  638, spi: 1.01, cpi: 1.01, eac:  634, vac:    6, status: 'commissioning' },
  { id: '9', project: 'Humansdorp Wind 90MW',       bac: 1720, ev: 1462, ac: 1580, spi: 0.85, cpi: 0.93, eac: 1849, vac: -129, status: 'construction' },
  { id: '10', project: 'Prieska Hybrid 75MW',       bac: 1450, ev: 1479, ac: 1440, spi: 1.02, cpi: 1.03, eac: 1408, vac:   42, status: 'commissioning' },
];

interface BondRow {
  id: string;
  ref: string;
  type: string;
  provider: string;
  faceValue: number;
  expiry: string;
  daysLeft: number;
  status: string;
}

const BOND_FALLBACK: BondRow[] = [
  { id: '1', ref: 'PB-2024-001', type: 'Performance Bond',   provider: 'Nedbank Corporate', faceValue: 284, expiry: '2026-08-15', daysLeft: 75,  status: 'active' },
  { id: '2', ref: 'PB-2024-002', type: 'Performance Bond',   provider: 'Absa Guarantees',   faceValue: 156, expiry: '2026-06-20', daysLeft: 19,  status: 'expiring' },
  { id: '3', ref: 'BI-2024-003', type: 'Bid Bond',           provider: 'Standard Bank',     faceValue:  92, expiry: '2026-09-30', daysLeft: 121, status: 'active' },
  { id: '4', ref: 'PB-2024-004', type: 'Performance Bond',   provider: 'FirstRand',         faceValue: 520, expiry: '2026-07-10', daysLeft: 39,  status: 'active' },
  { id: '5', ref: 'MI-2023-005', type: 'Marine & Transit',   provider: 'Hollard Industrial', faceValue:  48, expiry: '2026-06-05', daysLeft: 4,   status: 'expiring' },
  { id: '6', ref: 'PB-2024-006', type: 'Performance Bond',   provider: 'Nedbank Corporate', faceValue: 118, expiry: '2026-10-22', daysLeft: 143, status: 'active' },
  { id: '7', ref: 'CI-2024-007', type: 'Contractors All Risk', provider: 'Santam Industrial', faceValue: 265, expiry: '2026-06-28', daysLeft: 27,  status: 'at_risk' },
  { id: '8', ref: 'PB-2024-008', type: 'Performance Bond',   provider: 'Absa Guarantees',   faceValue: 172, expiry: '2026-11-15', daysLeft: 167, status: 'active' },
];

interface MilestoneRow {
  id: string;
  project: string;
  gate: string;
  pct: number;
  sla: string;
  status: string;
}

const MILESTONE_ROWS: MilestoneRow[] = [
  { id: '1', project: 'Boegoesberg Wind 140MW',     gate: 'DG3 — Financial Close',       pct: 88, sla: '2026-06-30', status: 'construction' },
  { id: '2', project: 'Loeriesfontein Solar 80MW',  gate: 'DG4 — COD',                   pct: 97, sla: '2026-07-15', status: 'commissioning' },
  { id: '3', project: 'Cookhouse BESS 50MWh',       gate: 'DG2 — Grid Connection Agmt',  pct: 61, sla: '2026-08-01', status: 'at_risk' },
  { id: '4', project: 'Saldanha Bay Offshore 200MW', gate: 'DG3 — Financial Close',      pct: 74, sla: '2026-09-30', status: 'construction' },
  { id: '5', project: 'Klipheuwel Wind 60MW',        gate: 'DG1 — Permitting Complete',  pct: 45, sla: '2026-07-20', status: 'at_risk' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' };

function spiColor(v: number): string {
  if (v < 0.9) return 'var(--oe-rose)';
  if (v < 1.0) return 'var(--oe-amber)';
  return 'var(--oe-green)';
}

function daysColor(d: number): string {
  if (d < 30) return 'var(--oe-rose)';
  if (d < 90) return 'var(--oe-amber)';
  return 'var(--oe-green)';
}

function fmtM(v: number): string {
  return `R${v.toLocaleString('en-ZA')}M`;
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div
      style={{
        background: 'var(--oe-surf)',
        border: '1px solid var(--oe-border)',
        borderRadius: 'var(--oe-r-card)',
        padding: '12px 16px',
        borderBottom: '2px solid var(--oe-border)',
      }}
    >
      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--oe-text-3)', marginBottom: '2px' }}>
        {label}
      </div>
      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--oe-text-1)' }}>
        {title}
      </div>
    </div>
  );
}

// ── EVM columns ───────────────────────────────────────────────────────────────

const evmColumns: Column<EvmRow>[] = [
  {
    key: 'project',
    header: 'Project',
    width: '220px',
    render: (row) => (
      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--oe-text-1)' }}>{row.project}</span>
    ),
  },
  {
    key: 'bac',
    header: 'BAC (ZAR M)',
    align: 'right',
    mono: true,
    render: (row) => <span style={MONO}>{fmtM(row.bac)}</span>,
  },
  {
    key: 'ev',
    header: 'EV',
    align: 'right',
    mono: true,
    render: (row) => <span style={MONO}>{fmtM(row.ev)}</span>,
  },
  {
    key: 'ac',
    header: 'AC',
    align: 'right',
    mono: true,
    render: (row) => <span style={MONO}>{fmtM(row.ac)}</span>,
  },
  {
    key: 'spi',
    header: 'SPI',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: spiColor(row.spi), fontWeight: 600 }}>{row.spi.toFixed(2)}</span>
    ),
  },
  {
    key: 'cpi',
    header: 'CPI',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: spiColor(row.cpi), fontWeight: 600 }}>{row.cpi.toFixed(2)}</span>
    ),
  },
  {
    key: 'eac',
    header: 'EAC',
    align: 'right',
    mono: true,
    render: (row) => <span style={MONO}>{fmtM(row.eac)}</span>,
  },
  {
    key: 'vac',
    header: 'VAC',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: row.vac >= 0 ? 'var(--oe-green)' : 'var(--oe-rose)', fontWeight: 600 }}>
        {row.vac >= 0 ? '+' : ''}{fmtM(row.vac)}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusPill label={row.status.replace(/_/g, ' ')} variant={stateVariant(row.status)} />,
  },
];

// ── Bond columns ──────────────────────────────────────────────────────────────

const bondColumns: Column<BondRow>[] = [
  { key: 'ref', header: 'Ref', width: '120px', render: (row) => <span style={{ ...MONO, fontSize: '12px' }}>{row.ref}</span> },
  { key: 'type', header: 'Type' },
  { key: 'provider', header: 'Provider' },
  {
    key: 'faceValue',
    header: 'Face Value (ZAR M)',
    align: 'right',
    render: (row) => <span style={MONO}>{fmtM(row.faceValue)}</span>,
  },
  { key: 'expiry', header: 'Expiry', render: (row) => <span style={MONO}>{row.expiry}</span> },
  {
    key: 'daysLeft',
    header: 'Days Left',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: daysColor(row.daysLeft), fontWeight: 600 }}>{row.daysLeft}</span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusPill label={row.status.replace(/_/g, ' ')} variant={stateVariant(row.status)} />,
  },
];

// ── Milestone progress bars ───────────────────────────────────────────────────

function MilestoneTable({ gates }: { gates: IppStageGate[] }) {
  const rows: MilestoneRow[] = gates.length > 0
    ? gates.map((g) => ({
        id: g.id,
        project: g.project_id,
        gate: g.gate,
        pct: typeof g.flags?.pct === 'number' ? (g.flags.pct as number) : 0,
        sla: g.decision_at ?? g.submitted_at ?? '—',
        status: g.status,
      }))
    : MILESTONE_ROWS;

  return (
    <div
      style={{
        background: 'var(--oe-canvas)',
        border: '1px solid var(--oe-border)',
        borderRadius: 'var(--oe-r-card)',
        overflow: 'hidden',
        boxShadow: 'var(--oe-shadow-card)',
      }}
    >
      {/* header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 200px 80px 110px 120px',
          padding: '8px 14px',
          background: 'var(--oe-grad-table-head)',
          borderBottom: '1px solid var(--oe-border)',
        }}
      >
        {['Project', 'Gate', '% Complete', 'SLA', 'Status'].map((h) => (
          <span
            key={h}
            style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--oe-text-3)' }}
          >
            {h}
          </span>
        ))}
      </div>

      {rows.map((row, i) => (
        <div
          key={row.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 200px 80px 110px 120px',
            padding: '12px 14px',
            borderBottom: i < rows.length - 1 ? '1px solid var(--oe-border-2)' : 'none',
            alignItems: 'center',
          }}
        >
          {/* Project name */}
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--oe-text-1)' }}>{row.project}</span>

          {/* Gate */}
          <span style={{ fontSize: '11px', color: 'var(--oe-text-2)' }}>{row.gate}</span>

          {/* Progress bar */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  flex: 1,
                  height: '6px',
                  background: 'var(--oe-surf-2)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${row.pct}%`,
                    background: 'var(--oe-navy-1)',
                    borderRadius: '3px',
                    transition: 'width 400ms var(--oe-ease)',
                  }}
                />
              </div>
              <span style={{ ...MONO, fontSize: '11px', color: 'var(--oe-text-2)', minWidth: '30px' }}>
                {row.pct}%
              </span>
            </div>
          </div>

          {/* SLA */}
          <span style={{ ...MONO, fontSize: '11px', color: 'var(--oe-text-2)' }}>{row.sla}</span>

          {/* Status */}
          <StatusPill label={row.status.replace(/_/g, ' ')} variant={stateVariant(row.status)} />
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function IppAnalytics() {
  const { data: evmRows, loading: evmLoading } = useIppEvm();
  const { data: bonds, loading: bondsLoading } = useIppBonds();
  const { data: gates, loading: gatesLoading } = useIppStageGates();

  // Derived KPIs from real data
  const portfolioBac = evmRows.reduce((s, r) => s + (r.bac_zar || 0), 0);
  const avgSpi = evmRows.length ? evmRows.reduce((s, r) => s + (r.spi || 0), 0) / evmRows.length : 0;
  const avgCpi = evmRows.length ? evmRows.reduce((s, r) => s + (r.cpi || 0), 0) / evmRows.length : 0;
  const expiredBonds = bonds.filter((b: IppBond) => b.days_remaining !== undefined && b.days_remaining < 30).length;

  // Map API data to display shapes — fallback to mocks while loading
  const evmData: EvmRow[] = evmLoading ? EVM_FALLBACK : evmRows.map((r: IppEvm) => ({
    id: r.id,
    project: r.project_name ?? r.project_id,
    bac: r.bac_zar ? r.bac_zar / 1e6 : 0,
    ev: r.ev_zar ? r.ev_zar / 1e6 : 0,
    ac: r.ac_zar ? r.ac_zar / 1e6 : 0,
    spi: r.spi ?? 1,
    cpi: r.cpi ?? 1,
    eac: r.eac_zar ? r.eac_zar / 1e6 : 0,
    vac: r.vac_zar ? r.vac_zar / 1e6 : 0,
    status: 'active',
  }));

  const bondData: BondRow[] = bondsLoading ? BOND_FALLBACK : bonds.map((b: IppBond) => ({
    id: b.id,
    ref: b.id.slice(-8).toUpperCase(),
    type: b.bond_type ?? 'Performance Bond',
    provider: b.issuer ?? '—',
    faceValue: b.face_value_zar ? b.face_value_zar / 1e6 : 0,
    expiry: b.expiry_date ?? '—',
    daysLeft: b.days_remaining ?? 0,
    status: b.status ?? 'active',
  }));

  // StatCard display values — use real data when loaded, fallback to fixed values while loading
  const bacDisplay = evmLoading ? '—' : portfolioBac > 0 ? `R${(portfolioBac / 1e9).toFixed(1)}B` : '—';
  const activeProjects = evmLoading ? '—' : String(evmRows.length || '—');
  const spiDisplay = evmLoading ? '—' : avgSpi > 0 ? avgSpi.toFixed(2) : '0.94';
  const expiredDisplay = bondsLoading ? '—' : String(expiredBonds);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px', background: 'var(--oe-canvas)', minHeight: '100vh' }}>

      {/* Page title */}
      <div>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--oe-text-1)', letterSpacing: '-0.02em' }}>
          Project Portfolio Analytics
        </h1>
      </div>

      {/* KPI row */}
      <StatGrid cols={4}>
        <StatCard label="Portfolio BAC" value={bacDisplay} variant="navy" icon="lightning" />
        <StatCard label="Active Projects" value={activeProjects} variant="green" icon="checklist" />
        <StatCard
          label="Avg Construction SPI"
          value={spiDisplay}
          variant={avgSpi > 0 && avgSpi < 0.95 ? 'amber' : 'green'}
          icon="chart-line"
          subtext={avgSpi > 0 && avgSpi < 1.0 ? 'Below schedule baseline' : undefined}
        />
        <StatCard label="Bonds Expiring <30d" value={expiredDisplay} variant={expiredBonds > 0 ? 'rose' : 'green'} icon="shield" subtext="Face value at risk" />
      </StatGrid>

      {/* Earned Value Management */}
      <SectionHeader label="Earned Value Management" title="EVM — All Active Projects" />
      <DataTable<EvmRow>
        columns={evmColumns}
        rows={evmData}
        compact={false}
        stickyHeader
      />

      {/* Bond & Insurance */}
      <SectionHeader label="Bonds & Insurance" title="Bond & Insurance Status" />
      <DataTable<BondRow>
        columns={bondColumns}
        rows={bondData}
        compact={false}
        stickyHeader
      />

      {/* Construction Milestones */}
      <SectionHeader label="Construction Progress" title="Milestone Gate Completion" />
      <MilestoneTable gates={gatesLoading ? [] : gates} />

    </div>
  );
}

export default IppAnalytics;
