import React from 'react';
import { StatCard, StatGrid } from '../../components/display/StatCard';
import { DataTable, Column } from '../../components/display/DataTable';
import { StatusPill } from '../../components/display/StatusPill';
import { useTraderPnl, useTraderOrders, useTraderPositions } from '../../lib/hooks';
import type { TraderOrder, TraderPosition } from '../../lib/client';

// ── Mock data (fallbacks) ─────────────────────────────────────────────────────

interface PnlRow {
  id: string;
  month: string;
  grossRevenue: number;
  cogs: number;
  netPnl: number;
  var99: number;
  sharpe: number;
  maxDrawdown: number;
}

const PNL_FALLBACK: PnlRow[] = [
  { id: '1',  month: 'Jan 2025', grossRevenue: 3840, cogs: 2910, netPnl:  930,  var99: 164, sharpe: 1.82, maxDrawdown: -210 },
  { id: '2',  month: 'Feb 2025', grossRevenue: 3210, cogs: 2680, netPnl:  530,  var99: 142, sharpe: 1.24, maxDrawdown: -380 },
  { id: '3',  month: 'Mar 2025', grossRevenue: 4120, cogs: 3020, netPnl: 1100,  var99: 195, sharpe: 2.11, maxDrawdown: -155 },
  { id: '4',  month: 'Apr 2025', grossRevenue: 2890, cogs: 2970, netPnl:  -80,  var99: 188, sharpe: -0.34, maxDrawdown: -590 },
  { id: '5',  month: 'May 2025', grossRevenue: 3650, cogs: 2840, netPnl:  810,  var99: 171, sharpe: 1.65, maxDrawdown: -245 },
  { id: '6',  month: 'Jun 2025', grossRevenue: 4380, cogs: 3140, netPnl: 1240,  var99: 198, sharpe: 2.29, maxDrawdown: -190 },
  { id: '7',  month: 'Jul 2025', grossRevenue: 3120, cogs: 2750, netPnl:  370,  var99: 155, sharpe: 0.88, maxDrawdown: -420 },
  { id: '8',  month: 'Aug 2025', grossRevenue: 3960, cogs: 3080, netPnl:  880,  var99: 167, sharpe: 1.77, maxDrawdown: -280 },
  { id: '9',  month: 'Sep 2025', grossRevenue: 4210, cogs: 3150, netPnl: 1060,  var99: 182, sharpe: 2.04, maxDrawdown: -195 },
  { id: '10', month: 'Oct 2025', grossRevenue: 3580, cogs: 2920, netPnl:  660,  var99: 159, sharpe: 1.41, maxDrawdown: -310 },
  { id: '11', month: 'Nov 2025', grossRevenue: 4050, cogs: 3010, netPnl: 1040,  var99: 178, sharpe: 2.02, maxDrawdown: -225 },
  { id: '12', month: 'Dec 2025', grossRevenue: 3780, cogs: 2870, netPnl:  910,  var99: 161, sharpe: 1.88, maxDrawdown: -265 },
];

interface PosLimitRow {
  id: string;
  energyType: string;
  longMw: number;
  shortMw: number;
  net: number;
  limit: number;
  utilisationPct: number;
  status: string;
}

const POS_LIMIT_FALLBACK: PosLimitRow[] = [
  { id: '1', energyType: 'Solar PV',        longMw: 420, shortMw: 180, net:  240, limit: 500, utilisationPct: 84, status: 'breach' },
  { id: '2', energyType: 'Wind Onshore',     longMw: 310, shortMw: 290, net:   20, limit: 600, utilisationPct: 52, status: 'compliant' },
  { id: '3', energyType: 'Wind Offshore',    longMw: 180, shortMw:  40, net:  140, limit: 300, utilisationPct: 60, status: 'compliant' },
  { id: '4', energyType: 'Gas Peaker',       longMw:  95, shortMw: 140, net:  -45, limit: 200, utilisationPct: 48, status: 'compliant' },
  { id: '5', energyType: 'Hydro',            longMw: 210, shortMw:  80, net:  130, limit: 250, utilisationPct: 84, status: 'breach' },
  { id: '6', energyType: 'BESS',             longMw: 155, shortMw:  70, net:   85, limit: 300, utilisationPct: 52, status: 'compliant' },
  { id: '7', energyType: 'Baseload Coal',    longMw:  60, shortMw: 200, net: -140, limit: 350, utilisationPct: 74, status: 'warning' },
  { id: '8', energyType: 'Nuclear',          longMw:  30, shortMw:  20, net:   10, limit: 100, utilisationPct: 30, status: 'compliant' },
];

interface BexRow {
  id: string;
  date: string;
  instrument: string;
  side: 'BUY' | 'SELL';
  sizeMw: number;
  executedPrice: number;
  vwap: number;
  slippageBps: number;
  score: number;
}

const BEX_ROWS: BexRow[] = [
  { id: '1',  date: '2025-12-28', instrument: 'OE-SOLAR-JAN26',  side: 'BUY',  sizeMw:  80, executedPrice: 892.40, vwap: 889.10, slippageBps:  37, score: 94 },
  { id: '2',  date: '2025-12-27', instrument: 'OE-WIND-JAN26',   side: 'SELL', sizeMw: 120, executedPrice: 741.20, vwap: 743.60, slippageBps:  32, score: 96 },
  { id: '3',  date: '2025-12-26', instrument: 'OE-SOLAR-FEB26',  side: 'BUY',  sizeMw:  60, executedPrice: 904.80, vwap: 895.30, slippageBps: 106, score: 71 },
  { id: '4',  date: '2025-12-24', instrument: 'OE-BESS-JAN26',   side: 'BUY',  sizeMw:  40, executedPrice: 1124.50, vwap: 1120.80, slippageBps:  33, score: 95 },
  { id: '5',  date: '2025-12-23', instrument: 'OE-WIND-FEB26',   side: 'SELL', sizeMw: 200, executedPrice: 718.90, vwap: 722.40, slippageBps:  48, score: 87 },
  { id: '6',  date: '2025-12-22', instrument: 'OE-SOLAR-JAN26',  side: 'SELL', sizeMw: 100, executedPrice: 888.10, vwap: 891.70, slippageBps:  40, score: 92 },
  { id: '7',  date: '2025-12-20', instrument: 'OE-GAS-JAN26',    side: 'BUY',  sizeMw:  50, executedPrice: 2340.00, vwap: 2318.50, slippageBps:  93, score: 78 },
  { id: '8',  date: '2025-12-19', instrument: 'OE-SOLAR-FEB26',  side: 'SELL', sizeMw:  70, executedPrice: 899.60, vwap: 898.20, slippageBps:  16, score: 98 },
  { id: '9',  date: '2025-12-18', instrument: 'OE-WIND-JAN26',   side: 'BUY',  sizeMw:  90, executedPrice: 748.30, vwap: 762.10, slippageBps: 181, score: 49 },
  { id: '10', date: '2025-12-17', instrument: 'OE-BESS-FEB26',   side: 'SELL', sizeMw:  35, executedPrice: 1136.90, vwap: 1134.60, slippageBps:  20, score: 97 },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' };

function pnlColor(v: number): string {
  if (v >= 0) return 'var(--oe-green)';
  return 'var(--oe-rose)';
}

function slippageColor(bps: number): string {
  if (bps > 50) return 'var(--oe-rose)';
  if (bps > 20) return 'var(--oe-amber)';
  return 'var(--oe-green)';
}

function utilisationColor(pct: number): string {
  if (pct > 80) return 'var(--oe-rose)';
  if (pct > 60) return 'var(--oe-amber)';
  return 'var(--oe-green)';
}

function fmtK(v: number): string {
  if (Math.abs(v) >= 1000) return `R${(v / 1000).toFixed(1)}M`;
  return `R${v}K`;
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

// ── P&L Attribution table (inline, with totals row) ───────────────────────────

function PnlTable({ rows }: { rows: PnlRow[] }) {
  const totals = rows.reduce(
    (acc, r) => ({
      grossRevenue: acc.grossRevenue + r.grossRevenue,
      cogs: acc.cogs + r.cogs,
      netPnl: acc.netPnl + r.netPnl,
      var99: Math.max(acc.var99, r.var99),
      sharpe: acc.sharpe + r.sharpe,
      maxDrawdown: Math.min(acc.maxDrawdown, r.maxDrawdown),
    }),
    { grossRevenue: 0, cogs: 0, netPnl: 0, var99: 0, sharpe: 0, maxDrawdown: 0 }
  );
  const avgSharpe = rows.length > 0 ? totals.sharpe / rows.length : 0;

  const COL_HEADERS = ['Month', 'Gross Revenue', 'COGS', 'Net P&L', 'VaR (99%)', 'Sharpe', 'Max Drawdown'];
  const thStyle: React.CSSProperties = {
    padding: '10px 14px',
    background: 'var(--oe-grad-table-head)',
    borderBottom: '1px solid var(--oe-border)',
    textAlign: 'right' as const,
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--oe-text-3)',
    whiteSpace: 'nowrap' as const,
  };

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
              {COL_HEADERS.map((h, i) => (
                <th key={h} style={{ ...thStyle, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id}
                style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--oe-border-2)' : 'none' }}
              >
                <td style={{ padding: '0 14px', height: '44px', color: 'var(--oe-text-2)', whiteSpace: 'nowrap', fontWeight: 500 }}>{row.month}</td>
                <td style={{ padding: '0 14px', height: '44px', textAlign: 'right' }}><span style={MONO}>R{row.grossRevenue.toLocaleString()}K</span></td>
                <td style={{ padding: '0 14px', height: '44px', textAlign: 'right' }}><span style={{ ...MONO, color: 'var(--oe-text-2)' }}>R{row.cogs.toLocaleString()}K</span></td>
                <td style={{ padding: '0 14px', height: '44px', textAlign: 'right' }}>
                  <span style={{ ...MONO, fontWeight: 700, color: pnlColor(row.netPnl) }}>
                    {row.netPnl >= 0 ? '+' : ''}R{row.netPnl.toLocaleString()}K
                  </span>
                </td>
                <td style={{ padding: '0 14px', height: '44px', textAlign: 'right' }}><span style={{ ...MONO, color: 'var(--oe-amber)' }}>R{row.var99}K</span></td>
                <td style={{ padding: '0 14px', height: '44px', textAlign: 'right' }}>
                  <span style={{ ...MONO, color: row.sharpe >= 1.5 ? 'var(--oe-green)' : row.sharpe < 0 ? 'var(--oe-rose)' : 'var(--oe-amber)', fontWeight: 600 }}>
                    {row.sharpe.toFixed(2)}
                  </span>
                </td>
                <td style={{ padding: '0 14px', height: '44px', textAlign: 'right' }}>
                  <span style={{ ...MONO, color: 'var(--oe-rose)' }}>R{row.maxDrawdown.toLocaleString()}K</span>
                </td>
              </tr>
            ))}
            {/* Totals row */}
            <tr style={{ background: 'var(--oe-surf)', borderTop: '2px solid var(--oe-border)' }}>
              <td style={{ padding: '0 14px', height: '44px', fontSize: '11px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Totals / Peak
              </td>
              <td style={{ padding: '0 14px', height: '44px', textAlign: 'right' }}><span style={{ ...MONO, fontWeight: 700 }}>R{totals.grossRevenue.toLocaleString()}K</span></td>
              <td style={{ padding: '0 14px', height: '44px', textAlign: 'right' }}><span style={{ ...MONO, color: 'var(--oe-text-2)', fontWeight: 700 }}>R{totals.cogs.toLocaleString()}K</span></td>
              <td style={{ padding: '0 14px', height: '44px', textAlign: 'right' }}>
                <span style={{ ...MONO, fontWeight: 700, color: pnlColor(totals.netPnl) }}>
                  R{totals.netPnl.toLocaleString()}K
                </span>
              </td>
              <td style={{ padding: '0 14px', height: '44px', textAlign: 'right' }}><span style={{ ...MONO, color: 'var(--oe-amber)', fontWeight: 700 }}>R{totals.var99}K</span></td>
              <td style={{ padding: '0 14px', height: '44px', textAlign: 'right' }}>
                <span style={{ ...MONO, fontWeight: 700, color: 'var(--oe-text-1)' }}>{avgSharpe.toFixed(2)}</span>
              </td>
              <td style={{ padding: '0 14px', height: '44px', textAlign: 'right' }}>
                <span style={{ ...MONO, fontWeight: 700, color: 'var(--oe-rose)' }}>R{totals.maxDrawdown.toLocaleString()}K</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Position limits columns ───────────────────────────────────────────────────

const posLimitColumns: Column<PosLimitRow>[] = [
  { key: 'energyType', header: 'Energy Type', width: '140px' },
  {
    key: 'longMw',
    header: 'Long (MW)',
    align: 'right',
    render: (row) => <span style={MONO}>{row.longMw}</span>,
  },
  {
    key: 'shortMw',
    header: 'Short (MW)',
    align: 'right',
    render: (row) => <span style={MONO}>{row.shortMw}</span>,
  },
  {
    key: 'net',
    header: 'Net',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, color: row.net >= 0 ? 'var(--oe-green)' : 'var(--oe-rose)', fontWeight: 600 }}>
        {row.net >= 0 ? '+' : ''}{row.net}
      </span>
    ),
  },
  {
    key: 'limit',
    header: 'Limit',
    align: 'right',
    render: (row) => <span style={{ ...MONO, color: 'var(--oe-text-3)' }}>{row.limit}</span>,
  },
  {
    key: 'utilisationPct',
    header: 'Utilisation %',
    width: '160px',
    render: (row) => {
      const color = utilisationColor(row.utilisationPct);
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                width: `${row.utilisationPct}%`,
                background: color,
                borderRadius: '3px',
                transition: 'width 400ms var(--oe-ease)',
              }}
            />
          </div>
          <span style={{ ...MONO, fontSize: '11px', color, fontWeight: 600, minWidth: '32px' }}>
            {row.utilisationPct}%
          </span>
        </div>
      );
    },
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => {
      const v = row.status === 'compliant' ? 'green' : row.status === 'warning' ? 'amber' : 'rose';
      return <StatusPill label={row.status} variant={v} />;
    },
  },
];

// ── Best execution columns ────────────────────────────────────────────────────

const bexColumns: Column<BexRow>[] = [
  { key: 'date', header: 'Date', render: (row) => <span style={MONO}>{row.date}</span> },
  { key: 'instrument', header: 'Instrument', width: '160px', render: (row) => <span style={{ ...MONO, fontSize: '11px' }}>{row.instrument}</span> },
  {
    key: 'side',
    header: 'Side',
    render: (row) => (
      <span style={{ ...MONO, fontWeight: 700, color: row.side === 'BUY' ? 'var(--oe-green)' : 'var(--oe-rose)' }}>
        {row.side}
      </span>
    ),
  },
  {
    key: 'sizeMw',
    header: 'Size (MW)',
    align: 'right',
    render: (row) => <span style={MONO}>{row.sizeMw}</span>,
  },
  {
    key: 'executedPrice',
    header: 'Executed Price',
    align: 'right',
    render: (row) => <span style={MONO}>R{row.executedPrice.toFixed(2)}</span>,
  },
  {
    key: 'vwap',
    header: 'VWAP',
    align: 'right',
    render: (row) => <span style={{ ...MONO, color: 'var(--oe-text-3)' }}>R{row.vwap.toFixed(2)}</span>,
  },
  {
    key: 'slippageBps',
    header: 'Slippage bps',
    align: 'right',
    render: (row) => (
      <span style={{ ...MONO, fontWeight: 700, color: slippageColor(row.slippageBps) }}>
        {row.slippageBps}
      </span>
    ),
  },
  {
    key: 'score',
    header: 'Score',
    align: 'right',
    render: (row) => {
      const color = row.score >= 90 ? 'var(--oe-green)' : row.score >= 75 ? 'var(--oe-amber)' : 'var(--oe-rose)';
      return (
        <span style={{ ...MONO, fontWeight: 700, color }}>
          {row.score}
        </span>
      );
    },
  },
];

// ── Main component ────────────────────────────────────────────────────────────

export function TraderAnalytics() {
  const { data: pnl, loading: pnlLoading } = useTraderPnl();
  const { data: orders } = useTraderOrders({ limit: 100 });
  const { data: positions } = useTraderPositions();

  // ── Computed KPIs ────────────────────────────────────────────────────────────
  const mtdPnl = pnl.reduce((s, p) => s + (p.net_pnl_zar || 0), 0);
  const ytdPnl = pnl.reduce((s, p) => s + (p.gross_revenue_zar || 0), 0);
  const openOrderCount = orders.filter((o: TraderOrder) => o.status === 'open' || o.status === 'partial').length;
  const totalVolume = orders.reduce((s, o: TraderOrder) => s + (o.volume_mwh || 0), 0);

  // ── Live P&L rows (mapped from TraderPnl, fallback to mock while loading) ────
  const pnlRows: PnlRow[] = pnlLoading
    ? PNL_FALLBACK
    : pnl.slice(0, 12).map((p, i) => ({
        id: String(i + 1),
        month: p.month ?? '—',
        grossRevenue: Math.round((p.gross_revenue_zar ?? 0) / 1000),
        cogs: Math.round((p.cogs_zar ?? 0) / 1000),
        netPnl: Math.round((p.net_pnl_zar ?? 0) / 1000),
        var99: Math.round((p.var_zar ?? 0) / 1000),
        sharpe: p.sharpe ?? 0,
        maxDrawdown: Math.round((p.max_drawdown_zar ?? 0) / 1000),
      }));

  // ── Live position rows (mapped from TraderPosition) ──────────────────────────
  const positionRows: PosLimitRow[] = positions.length > 0
    ? positions.map((p: TraderPosition, i: number) => {
        const utilisationPct = Math.round(p.utilisation_pct ?? 0);
        const status =
          utilisationPct > 80 ? 'breach' :
          utilisationPct > 60 ? 'warning' :
          'compliant';
        return {
          id: String(i + 1),
          energyType: p.energy_type,
          longMw: Math.round(p.long_mwh ?? 0),
          shortMw: Math.round(p.short_mwh ?? 0),
          net: Math.round(p.net_mwh ?? 0),
          limit: Math.round(p.limit_mw ?? 500),
          utilisationPct,
          status,
        };
      })
    : POS_LIMIT_FALLBACK;

  // ── KPI formatting helpers ────────────────────────────────────────────────────
  const mtdPnlLabel = mtdPnl === 0 && pnlLoading
    ? '—'
    : `R${(Math.abs(mtdPnl) / 1_000_000).toFixed(1)}M`;
  const mtdPnlPositive = mtdPnl >= 0;

  const varLabel = pnl.length > 0
    ? `R${Math.round(Math.max(...pnl.map(p => p.var_zar ?? 0)) / 1000)}K`
    : 'R180K';

  const openOrdersLabel = openOrderCount > 0 || orders.length > 0
    ? openOrderCount
    : 23;

  const totalVolumeLabel = totalVolume > 0
    ? `${(totalVolume / 1000).toFixed(1)}K MWh`
    : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px', background: 'var(--oe-canvas)', minHeight: '100vh' }}>

      {/* Page title */}
      <div>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--oe-text-1)', letterSpacing: '-0.02em' }}>
          Trading Performance Analytics
        </h1>
      </div>

      {/* KPI row */}
      <StatGrid cols={5}>
        <StatCard
          label="MTD P&L"
          value={pnlLoading ? '—' : mtdPnlLabel}
          variant={mtdPnlPositive ? 'green' : 'rose'}
          icon="trend-up"
          positive={mtdPnlPositive}
          deltaLabel="net realized"
        />
        <StatCard
          label="Daily VaR (99%)"
          value={varLabel}
          variant="amber"
          icon="alert-triangle"
          subtext="vs R250K limit"
        />
        <StatCard
          label="Open Orders"
          value={openOrdersLabel}
          variant="navy"
          icon="chart-line"
          subtext={totalVolumeLabel !== '—' ? `${totalVolumeLabel} total` : undefined}
        />
        <StatCard label="Best Execution Rate" value="94.2%" variant="green" icon="check-circle" subtext="vs 90% target" />
        <StatCard label="Margin Utilisation" value="38%" variant="green" icon="bar-chart" subtext="vs 80% limit" />
      </StatGrid>

      {/* Monthly P&L Attribution */}
      <SectionHeader label="P&L Attribution" title="Monthly P&L Breakdown" />
      <PnlTable rows={pnlRows} />

      {/* Position Limits */}
      <SectionHeader label="Position Limits" title="Open Positions vs Limits by Energy Type" />
      <DataTable<PosLimitRow>
        columns={posLimitColumns}
        rows={positionRows}
        compact={false}
        stickyHeader
      />

      {/* Best Execution Quality */}
      <SectionHeader label="Best Execution" title="Recent Trade Quality — Slippage & Score" />
      <DataTable<BexRow>
        columns={bexColumns}
        rows={BEX_ROWS}
        compact={false}
        stickyHeader
      />

    </div>
  );
}

export default TraderAnalytics;
