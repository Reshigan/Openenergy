import React from 'react';
import { StatCard, StatGrid } from '../../components/display/StatCard';
import { DataTable, Column } from '../../components/display/DataTable';
import { StatusPill, stateVariant } from '../../components/display/StatusPill';
import { useLenderFacilities, useLenderCovenants, useLenderDrawdowns } from '../../lib/hooks';
import type { LenderFacility } from '../../lib/client';

// ── Mock data ────────────────────────────────────────────────────────────────

const DSCR_PROJECTS_FALLBACK = [
  'Boegoesberg Wind',
  'Loeriesfontein Solar',
  'Saldanha Bay Offshore',
  'De Aar Solar',
  'Upington PV',
  'Cookhouse BESS',
] as const;

type DscrProjectFallback = typeof DSCR_PROJECTS_FALLBACK[number];

const DSCR_QUARTERS = ['Q3 2024', 'Q4 2024', 'Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025'] as const;

const DSCR_DATA_FALLBACK: Record<DscrProjectFallback, number[]> = {
  'Boegoesberg Wind':       [1.42, 1.38, 1.29, 1.24, 1.31, 1.35],
  'Loeriesfontein Solar':   [1.18, 1.09, 1.07, 1.15, 1.22, 1.28],
  'Saldanha Bay Offshore':  [1.51, 1.48, 1.44, 1.39, 1.41, 1.45],
  'De Aar Solar':           [1.33, 1.31, 1.35, 1.38, 1.40, 1.42],
  'Upington PV':            [1.26, 1.19, 1.14, 1.08, 1.12, 1.17],
  'Cookhouse BESS':         [1.44, 1.40, 1.38, 1.33, 1.29, 1.22],
};

interface LoanRow {
  id: string;
  facilityRef: string;
  borrower: string;
  principal: number;
  outstanding: number;
  maturity: string;
  dscr: number;
  covenantStatus: string;
  watch: boolean;
}

const LOAN_ROWS_FALLBACK: LoanRow[] = [
  { id: '1',  facilityRef: 'LF-2021-001', borrower: 'Boegoesberg Wind (Pty) Ltd',   principal: 680, outstanding: 582, maturity: '2038-06-30', dscr: 1.35, covenantStatus: 'compliant',    watch: false },
  { id: '2',  facilityRef: 'LF-2021-002', borrower: 'Loeriesfontein Solar SPV',      principal: 360, outstanding: 318, maturity: '2036-12-31', dscr: 1.28, covenantStatus: 'watchlist',    watch: true  },
  { id: '3',  facilityRef: 'LF-2022-003', borrower: 'Saldanha Bay Offshore SPV',     principal: 1240, outstanding: 1198, maturity: '2042-03-31', dscr: 1.45, covenantStatus: 'compliant',   watch: false },
  { id: '4',  facilityRef: 'LF-2022-004', borrower: 'De Aar Solar (RF) Ltd',         principal: 620, outstanding: 541, maturity: '2039-09-30', dscr: 1.42, covenantStatus: 'compliant',    watch: false },
  { id: '5',  facilityRef: 'LF-2022-005', borrower: 'Upington Hybrid SPV',           principal: 490, outstanding: 435, maturity: '2037-06-30', dscr: 1.17, covenantStatus: 'watchlist',    watch: true  },
  { id: '6',  facilityRef: 'LF-2023-006', borrower: 'Cookhouse BESS (Pty) Ltd',      principal: 210, outstanding: 205, maturity: '2038-12-31', dscr: 1.22, covenantStatus: 'watchlist',    watch: true  },
  { id: '7',  facilityRef: 'LF-2023-007', borrower: 'Klipheuwel Wind SPV',           principal: 270, outstanding: 252, maturity: '2036-03-31', dscr: 1.38, covenantStatus: 'compliant',    watch: false },
  { id: '8',  facilityRef: 'LF-2023-008', borrower: 'Humansdorp Wind (RF) Ltd',      principal: 395, outstanding: 380, maturity: '2040-06-30', dscr: 1.31, covenantStatus: 'compliant',    watch: false },
  { id: '9',  facilityRef: 'LF-2024-009', borrower: 'Prieska Hybrid SPV',            principal: 330, outstanding: 328, maturity: '2041-03-31', dscr: 1.44, covenantStatus: 'compliant',    watch: false },
  { id: '10', facilityRef: 'LF-2024-010', borrower: 'Beaufort West BESS Ltd',        principal: 145, outstanding: 144, maturity: '2039-09-30', dscr: 1.29, covenantStatus: 'breach',       watch: true  },
  { id: '11', facilityRef: 'LF-2024-011', borrower: 'Copperton Solar (Pty) Ltd',     principal: 285, outstanding: 272, maturity: '2038-06-30', dscr: 1.51, covenantStatus: 'compliant',    watch: false },
  { id: '12', facilityRef: 'LF-2024-012', borrower: 'Aggeneys Wind SPV',             principal: 190, outstanding: 188, maturity: '2040-12-31', dscr: 1.09, covenantStatus: 'breach',       watch: true  },
];

interface DrawdownRow {
  id: string;
  drawdownRef: string;
  project: string;
  amount: number;
  ieCert: string;
  disbursed: number;
  delta: number;
  matchStatus: string;
}

const DRAWDOWN_ROWS_FALLBACK: DrawdownRow[] = [
  { id: '1', drawdownRef: 'DD-2025-0041', project: 'Boegoesberg Wind',       amount: 48.0, ieCert: 'IE-240312', disbursed: 48.0, delta:   0,   matchStatus: 'MATCHED' },
  { id: '2', drawdownRef: 'DD-2025-0042', project: 'Saldanha Bay Offshore',  amount: 120.0, ieCert: 'IE-240401', disbursed: 120.0, delta:  0,   matchStatus: 'MATCHED' },
  { id: '3', drawdownRef: 'DD-2025-0043', project: 'Loeriesfontein Solar',   amount:  32.5, ieCert: 'IE-240318', disbursed:  29.8, delta: -2.7, matchStatus: 'VARIANCE' },
  { id: '4', drawdownRef: 'DD-2025-0044', project: 'Cookhouse BESS',         amount:  18.0, ieCert: 'PENDING',   disbursed:   0,   delta: -18.0, matchStatus: 'OPEN' },
  { id: '5', drawdownRef: 'DD-2025-0045', project: 'De Aar Solar',           amount:  55.0, ieCert: 'IE-240420', disbursed:  55.0, delta:   0,   matchStatus: 'MATCHED' },
  { id: '6', drawdownRef: 'DD-2025-0046', project: 'Klipheuwel Wind',        amount:  22.0, ieCert: 'IE-240405', disbursed:  21.2, delta: -0.8, matchStatus: 'VARIANCE' },
  { id: '7', drawdownRef: 'DD-2025-0047', project: 'Humansdorp Wind',        amount:  38.5, ieCert: 'PENDING',   disbursed:   0,   delta: -38.5, matchStatus: 'OPEN' },
  { id: '8', drawdownRef: 'DD-2025-0048', project: 'Prieska Hybrid',         amount:  29.0, ieCert: 'IE-240430', disbursed:  29.0, delta:   0,   matchStatus: 'MATCHED' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' };

function dscrCellBg(v: number): string {
  if (v < 1.10) return 'var(--oe-rose-bg)';
  if (v < 1.20) return 'var(--oe-amber-bg)';
  if (v < 1.30) return 'var(--oe-blue-bg)';
  return 'var(--oe-green-bg)';
}

function dscrCellColor(v: number): string {
  if (v < 1.10) return 'var(--oe-rose)';
  if (v < 1.20) return 'var(--oe-amber)';
  if (v < 1.30) return 'var(--oe-blue)';
  return 'var(--oe-green)';
}

function matchVariant(s: string): 'green' | 'rose' | 'amber' {
  if (s === 'MATCHED') return 'green';
  if (s === 'VARIANCE') return 'rose';
  return 'amber';
}

function covenantVariant(s: string): 'green' | 'amber' | 'rose' {
  if (s === 'compliant') return 'green';
  if (s === 'watchlist') return 'amber';
  return 'rose';
}

function fmtM(v: number): string {
  return `R${v.toFixed(0)}M`;
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

// ── DSCR Matrix ───────────────────────────────────────────────────────────────

function DscrMatrix({ facilities }: { facilities: LenderFacility[] }) {
  // When live facilities are available, render one row per facility with a single current DSCR value
  // repeated across columns (acts as a "latest period" snapshot). When empty, use full fallback.
  const useLive = facilities.length > 0;

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
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr>
              <th
                style={{
                  padding: '10px 14px',
                  background: 'var(--oe-grad-table-head)',
                  borderBottom: '1px solid var(--oe-border)',
                  textAlign: 'left',
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--oe-text-3)',
                  whiteSpace: 'nowrap',
                  minWidth: '180px',
                }}
              >
                Project
              </th>
              {DSCR_QUARTERS.map((q) => (
                <th
                  key={q}
                  style={{
                    padding: '10px 14px',
                    background: 'var(--oe-grad-table-head)',
                    borderBottom: '1px solid var(--oe-border)',
                    textAlign: 'center',
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--oe-text-3)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {q}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {useLive
              ? facilities.map((f, pi) => {
                  const dscr = f.dscr ?? 0;
                  // Fill all quarter columns with the current DSCR (single snapshot)
                  const series = DSCR_QUARTERS.map(() => dscr);
                  return (
                    <tr
                      key={f.id}
                      style={{ borderBottom: pi < facilities.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}
                    >
                      <td style={{ padding: '0 14px', height: '44px', color: 'var(--oe-text-1)', fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {f.project_name ?? f.borrower_name}
                      </td>
                      {series.map((val, qi) => (
                        <td
                          key={qi}
                          style={{
                            padding: '0 14px',
                            height: '44px',
                            textAlign: 'center',
                            background: dscrCellBg(val),
                          }}
                        >
                          <span
                            style={{
                              ...MONO,
                              fontSize: '12px',
                              fontWeight: 700,
                              color: dscrCellColor(val),
                            }}
                          >
                            {val.toFixed(2)}
                          </span>
                        </td>
                      ))}
                    </tr>
                  );
                })
              : DSCR_PROJECTS_FALLBACK.map((proj, pi) => (
                  <tr
                    key={proj}
                    style={{ borderBottom: pi < DSCR_PROJECTS_FALLBACK.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}
                  >
                    <td style={{ padding: '0 14px', height: '44px', color: 'var(--oe-text-1)', fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {proj}
                    </td>
                    {DSCR_DATA_FALLBACK[proj].map((val, qi) => (
                      <td
                        key={qi}
                        style={{
                          padding: '0 14px',
                          height: '44px',
                          textAlign: 'center',
                          background: dscrCellBg(val),
                        }}
                      >
                        <span
                          style={{
                            ...MONO,
                            fontSize: '12px',
                            fontWeight: 700,
                            color: dscrCellColor(val),
                          }}
                        >
                          {val.toFixed(2)}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
      {/* Legend */}
      <div
        style={{
          padding: '8px 14px',
          borderTop: '1px solid var(--oe-border-2)',
          background: 'var(--oe-surf)',
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
        }}
      >
        {[
          { label: '≥ 1.30', bg: 'var(--oe-green-bg)', color: 'var(--oe-green)' },
          { label: '1.20 – 1.30', bg: 'var(--oe-blue-bg)', color: 'var(--oe-blue)' },
          { label: '1.10 – 1.20', bg: 'var(--oe-amber-bg)', color: 'var(--oe-amber)' },
          { label: '< 1.10', bg: 'var(--oe-rose-bg)', color: 'var(--oe-rose)' },
        ].map((l) => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: l.bg, border: `1px solid ${l.color}` }} />
            <span style={{ fontSize: '10px', color: 'var(--oe-text-3)', fontWeight: 600 }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Loan portfolio columns ────────────────────────────────────────────────────

const loanColumns: Column<LoanRow>[] = [
  {
    key: 'facilityRef',
    header: 'Facility Ref',
    width: '120px',
    render: (row) => <span style={{ ...MONO, fontSize: '11px' }}>{row.facilityRef}</span>,
  },
  { key: 'borrower', header: 'Borrower', width: '220px' },
  {
    key: 'principal',
    header: 'Principal (ZAR M)',
    align: 'right',
    render: (row) => <span style={MONO}>{fmtM(row.principal)}</span>,
  },
  {
    key: 'outstanding',
    header: 'Outstanding',
    align: 'right',
    render: (row) => <span style={MONO}>{fmtM(row.outstanding)}</span>,
  },
  { key: 'maturity', header: 'Maturity', render: (row) => <span style={MONO}>{row.maturity}</span> },
  {
    key: 'dscr',
    header: 'DSCR',
    align: 'right',
    render: (row) => (
      <span
        style={{
          ...MONO,
          fontWeight: 700,
          color: dscrCellColor(row.dscr),
          background: dscrCellBg(row.dscr),
          padding: '2px 6px',
          borderRadius: '4px',
        }}
      >
        {row.dscr.toFixed(2)}
      </span>
    ),
  },
  {
    key: 'covenantStatus',
    header: 'Covenant Status',
    render: (row) => (
      <StatusPill label={row.covenantStatus} variant={covenantVariant(row.covenantStatus)} />
    ),
  },
  {
    key: 'watch',
    header: 'Watch',
    align: 'center',
    render: (row) => (
      <span
        style={{
          display: 'inline-block',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: row.watch ? 'var(--oe-rose)' : 'var(--oe-green)',
        }}
      />
    ),
  },
];

// ── Drawdown columns ──────────────────────────────────────────────────────────

const drawdownColumns: Column<DrawdownRow>[] = [
  {
    key: 'drawdownRef',
    header: 'Drawdown Ref',
    width: '130px',
    render: (row) => <span style={{ ...MONO, fontSize: '11px' }}>{row.drawdownRef}</span>,
  },
  { key: 'project', header: 'Project', width: '180px' },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    render: (row) => <span style={MONO}>{fmtM(row.amount)}</span>,
  },
  { key: 'ieCert', header: 'IE Cert', render: (row) => <span style={{ ...MONO, fontSize: '11px' }}>{row.ieCert}</span> },
  {
    key: 'disbursed',
    header: 'Disbursed',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: row.disbursed === 0 ? 'var(--oe-text-3)' : 'var(--oe-text-1)' }}>
        {row.disbursed === 0 ? '—' : fmtM(row.disbursed)}
      </span>
    ),
  },
  {
    key: 'delta',
    header: 'Delta',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: row.delta === 0 ? 'var(--oe-green)' : 'var(--oe-rose)', fontWeight: 600 }}>
        {row.delta === 0 ? '—' : fmtM(row.delta)}
      </span>
    ),
  },
  {
    key: 'matchStatus',
    header: 'Match Status',
    render: (row) => (
      <StatusPill label={row.matchStatus} variant={matchVariant(row.matchStatus)} />
    ),
  },
];

// ── Main component ────────────────────────────────────────────────────────────

export function LenderAnalytics() {
  const { data: facilities, loading: facLoading } = useLenderFacilities();
  const { data: covenants } = useLenderCovenants();
  const { data: drawdowns } = useLenderDrawdowns();

  // Derived KPIs
  const bookSize = facilities.reduce((s, f) => s + (f.committed_zar || 0), 0);
  const avgDscr = facilities.length
    ? facilities.reduce((s, f) => s + (f.dscr || 0), 0) / facilities.length
    : 0;
  const watchlistCount = facilities.filter((f) => f.status === 'watchlist').length;
  const breachedCovenants = covenants.filter((c) => c.status === 'breached').length;

  // Map live facilities to LoanRow shape for the portfolio table
  const loanRows: LoanRow[] = facLoading
    ? LOAN_ROWS_FALLBACK
    : facilities.length > 0
      ? facilities.map((f: LenderFacility) => ({
          id: f.id,
          facilityRef: f.id.slice(-10).toUpperCase(),
          borrower: f.borrower_name,
          principal: f.committed_zar ? f.committed_zar / 1e6 : 0,
          outstanding: f.drawn_zar ? f.drawn_zar / 1e6 : 0,
          maturity: f.maturity_date ?? '—',
          dscr: f.dscr ?? 0,
          covenantStatus: f.status ?? 'compliant',
          watch: f.status === 'watchlist' || f.status === 'breach' || f.status === 'breached',
        }))
      : LOAN_ROWS_FALLBACK;

  // Map live drawdowns to DrawdownRow shape
  const drawdownRows: DrawdownRow[] = drawdowns.length > 0
    ? drawdowns.map((d) => ({
        id: d.id,
        drawdownRef: d.drawdown_ref,
        project: d.facility_id,
        amount: d.amount_zar ? d.amount_zar / 1e6 : 0,
        ieCert: d.ie_cert_ref ?? 'PENDING',
        disbursed: d.disbursed_amount ? d.disbursed_amount / 1e6 : 0,
        delta: d.delta_zar ? d.delta_zar / 1e6 : 0,
        matchStatus: d.match_status ?? 'OPEN',
      }))
    : DRAWDOWN_ROWS_FALLBACK;

  // StatCard display values
  const bookSizeDisplay = facLoading ? '—' : bookSize > 0 ? `R${(bookSize / 1e9).toFixed(1)}B` : '—';
  const avgDscrDisplay = facLoading ? '—' : avgDscr > 0 ? avgDscr.toFixed(2) : '—';
  const watchlistDisplay = facLoading ? '—' : String(watchlistCount);
  const breachedDisplay = String(breachedCovenants);
  const performingCount = facilities.length > 0
    ? facilities.filter((f) => f.status === 'compliant' || f.status === 'active').length
    : 47;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px', background: 'var(--oe-canvas)', minHeight: '100vh' }}>

      {/* Page title */}
      <div>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--oe-text-1)', letterSpacing: '-0.02em' }}>
          Portfolio Performance Analytics
        </h1>
      </div>

      {/* KPI row */}
      <StatGrid cols={5}>
        <StatCard label="Total Exposure" value={bookSizeDisplay} variant="navy" icon="dollar" />
        <StatCard label="Avg DSCR" value={avgDscrDisplay} variant={avgDscr > 0 && avgDscr < 1.2 ? 'amber' : 'green'} icon="chart-line" subtext="LMA covenant ≥ 1.10" />
        <StatCard label="Covenant Breaches" value={breachedDisplay} variant={breachedCovenants > 0 ? 'rose' : 'green'} icon="alert-triangle" />
        <StatCard label="Performing Loans" value={String(performingCount)} variant="green" icon="checklist" />
        <StatCard label="Watchlist" value={watchlistDisplay} variant={watchlistCount > 0 ? 'amber' : 'green'} icon="calendar" />
      </StatGrid>

      {/* DSCR Matrix */}
      <SectionHeader label="DSCR Trend" title="DSCR — Quarterly by Project" />
      <DscrMatrix facilities={facLoading ? [] : facilities} />

      {/* Loan Portfolio */}
      <SectionHeader label="Loan Portfolio" title="Active Credit Facilities" />
      <DataTable<LoanRow>
        columns={loanColumns}
        rows={loanRows}
        compact={false}
        stickyHeader
      />

      {/* Drawdown vs Disbursement */}
      <SectionHeader label="Drawdowns" title="Drawdown vs Disbursement Reconciliation" />
      <DataTable<DrawdownRow>
        columns={drawdownColumns}
        rows={drawdownRows}
        compact={false}
        stickyHeader
      />

    </div>
  );
}

export default LenderAnalytics;
