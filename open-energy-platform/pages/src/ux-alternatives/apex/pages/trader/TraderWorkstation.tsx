/**
 * Trader Workstation — Apex design
 *
 * Screens:
 * 1. Trade Desk          — live order book summary, P&L, VaR
 * 2. Orders              — order list with pre-trade guard status
 * 3. Positions           — position limit chain (W29)
 * 4. Market Abuse        — surveillance (W52)
 * 5. RFQ/Best Exec       — best execution (W36)
 * 6. Trade Reporting     — OTC reporting (W44)
 * 7. Algo Certs          — algo cert + kill-switch (W60)
 * 8. Allocations         — trade allocation chain (W76)
 * 9. Analytics           — P&L attribution, VaR timeseries, VWAP
 * 10. Settlement Fails   — CSDR buy-in management (W85)
 * 11. Benchmark Transition — JIBAR to ZARONIA transition (W90)
 */

import React, { useState } from 'react';
import { TraderAnalytics } from '../analytics/TraderAnalytics';
import { AppShell, NavConfig } from '../../components/shell/AppShell';
import { StatCard, StatGrid } from '../../components/display/StatCard';
import { DataTable, Column } from '../../components/display/DataTable';
import { StatusPill, stateVariant } from '../../components/display/StatusPill';
import { AIInsightCard } from '../../components/display/AIInsightCard';
import { ActionPanel } from '../../components/actions/ActionPanel';
import { TransitionForm } from '../../components/actions/TransitionForm';
import { OeIcon } from '../../components/icons/Icons';
import { DetailDrawer, DrawerField, DrawerAction } from '../../components/display/DetailDrawer';
import { useTraderOrders, useTraderPositions, useTraderPnl, useAuditBlocks, useCurrentUser } from '../../lib/hooks';
import { TraderOrder, TraderPosition, TraderPnl, AuditBlock, apexClient } from '../../lib/client';
import { api } from '../../../../lib/api';

// ─── Nav ─────────────────────────────────────────────────────────────────────

const TRADER_NAV: NavConfig = {
  activeId: 'tr-desk',
  sections: [
    {
      id: 'trading',
      label: 'Trading',
      items: [
        { id: 'tr-desk',       label: 'Trade Desk',     href: '#desk',      icon: 'lightning' },
        { id: 'tr-orders',     label: 'Orders',         href: '#orders',    icon: 'list' },
        { id: 'tr-positions',  label: 'Positions',      href: '#positions', icon: 'bar-chart' },
        { id: 'tr-rfq',        label: 'RFQ',            href: '#rfq',       icon: 'send' },
      ],
    },
    {
      id: 'compliance',
      label: 'Compliance',
      items: [
        { id: 'tr-abuse',              label: 'Market Abuse',          href: '#abuse',              icon: 'shield',         badge: 1, badgeVariant: 'rose' },
        { id: 'tr-reporting',          label: 'Trade Reporting',       href: '#reporting',          icon: 'report' },
        { id: 'tr-algo',               label: 'Algo Certs',            href: '#algo',               icon: 'gear' },
        { id: 'tr-alloc',              label: 'Allocations',           href: '#alloc',              icon: 'hierarchy' },
        { id: 'tr-margin',             label: 'Margin',                href: '#margin',             icon: 'scales',         badge: 1, badgeVariant: 'amber' },
        { id: 'tr-mm',                 label: 'MM Compliance',         href: '#mm',                 icon: 'shield' },
        { id: 'trader-pre-trade',      label: 'Pre-Trade Credit W107', href: '#',                   icon: 'lock',           badge: 2, badgeVariant: 'rose' },
        { id: 'tr-settlement-fails',   label: 'Settlement Fails W85',  href: '#settlement-fails',   icon: 'alert-triangle' },
        { id: 'tr-benchmark',          label: 'Benchmark Transition W90', href: '#benchmark',       icon: 'checklist' },
      ],
    },
    {
      id: 'analytics',
      label: 'Analytics',
      items: [
        { id: 'tr-pnl',              label: 'P&L Analytics',       href: '#pnl',      icon: 'chart-line' },
        { id: 'tr-risk',             label: 'Risk Dashboard',      href: '#risk',     icon: 'alert-triangle' },
        { id: 'trader-pnl-attr',     label: 'P&L Attribution W111', href: '#',        icon: 'chart-line' },
      ],
    },
  ],
};

// ─── Column definitions ───────────────────────────────────────────────────────

const ORDER_COLS: Column<TraderOrder>[] = [
  { key: 'id',          header: 'Order ID',    mono: true },
  { key: 'energy_type', header: 'Instrument',  width: '200px' },
  { key: 'side',        header: 'Side',        render: row => (
    <span style={{ fontWeight: 700, color: row.side === 'buy' ? 'var(--oe-green)' : 'var(--oe-rose)' }}>
      {row.side === 'buy' ? 'Buy' : 'Sell'}
    </span>
  )},
  { key: 'volume_mwh',  header: 'Quantity',    align: 'right', mono: true,
    render: row => <span>{row.volume_mwh} MWh</span> },
  { key: 'price',       header: 'Price',       align: 'right', mono: true,
    render: row => <span>{row.price != null ? `R${row.price.toLocaleString()}/MWh` : '—'}</span> },
  { key: 'status',      header: 'Status',      render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
  { key: 'created_at',  header: 'Time',        align: 'right', mono: true,
    render: row => <span>{row.created_at ? new Date(row.created_at).toLocaleTimeString() : '—'}</span> },
];

const ORDER_FULL_COLS: Column<TraderOrder>[] = [
  { key: 'id',          header: 'Order ID',    mono: true },
  { key: 'energy_type', header: 'Instrument' },
  { key: 'side',        header: 'Side',        render: row => (
    <span style={{ fontWeight: 700, color: row.side === 'buy' ? 'var(--oe-green)' : 'var(--oe-rose)' }}>
      {row.side === 'buy' ? 'Buy' : 'Sell'}
    </span>
  )},
  { key: 'volume_mwh',  header: 'Volume',      align: 'right', mono: true, render: row => <span>{row.volume_mwh} MWh</span> },
  { key: 'price',       header: 'Price',       align: 'right', mono: true, render: row => <span>{row.price != null ? `R${row.price.toLocaleString()}` : '—'}</span> },
  { key: 'instruction', header: 'Instruction', mono: true },
  { key: 'status',      header: 'Status',      render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
  { key: 'created_at',  header: 'Created',     align: 'right', mono: true, render: row => <span>{row.created_at ? new Date(row.created_at).toLocaleTimeString() : '—'}</span> },
];

const POSITION_COLS: Column<TraderPosition>[] = [
  { key: 'energy_type',     header: 'Instrument' },
  { key: 'long_mwh',        header: 'Long',          align: 'right', mono: true, render: row => <span>{row.long_mwh} MWh</span> },
  { key: 'short_mwh',       header: 'Short',         align: 'right', mono: true, render: row => <span>{row.short_mwh} MWh</span> },
  { key: 'net_mwh',         header: 'Net',           align: 'right', mono: true,
    render: row => <span style={{ color: row.net_mwh < 0 ? 'var(--oe-rose)' : row.net_mwh > 0 ? 'var(--oe-green)' : 'var(--oe-text-3)' }}>{row.net_mwh >= 0 ? '+' : ''}{row.net_mwh} MWh</span> },
  { key: 'mark_price',      header: 'Mark Price',    align: 'right', mono: true, render: row => <span>R{row.mark_price.toLocaleString()}</span> },
  { key: 'unrealised_pnl',  header: 'Unrealised P&L', align: 'right', mono: true,
    render: row => <span style={{ color: row.unrealised_pnl >= 0 ? 'var(--oe-green)' : 'var(--oe-rose)' }}>{row.unrealised_pnl >= 0 ? '+' : ''}R{Math.abs(row.unrealised_pnl).toLocaleString()}</span> },
  { key: 'utilisation_pct', header: 'Utilisation',   align: 'right', mono: true,
    render: row => <span style={{ color: row.utilisation_pct > 90 ? 'var(--oe-rose)' : row.utilisation_pct > 70 ? 'var(--oe-amber)' : 'var(--oe-text-1)' }}>{row.utilisation_pct.toFixed(1)}%</span> },
];

const PNL_COLS: Column<TraderPnl>[] = [
  { key: 'month',            header: 'Month',        mono: true },
  { key: 'net_pnl_zar',     header: 'Net P&L',      align: 'right', mono: true,
    render: row => <span style={{ color: row.net_pnl_zar >= 0 ? 'var(--oe-green)' : 'var(--oe-rose)' }}>{'R' + (row.net_pnl_zar / 1e6).toFixed(1) + 'M'}</span> },
  { key: 'var_zar',         header: 'VaR',           align: 'right', mono: true, render: row => <span>{'R' + (row.var_zar / 1e6).toFixed(1) + 'M'}</span> },
  { key: 'sharpe',          header: 'Sharpe',        align: 'right', mono: true, render: row => <span>{row.sharpe.toFixed(2)}</span> },
  { key: 'max_drawdown_zar',header: 'Max Drawdown',  align: 'right', mono: true, render: row => <span style={{ color: 'var(--oe-rose)' }}>{'R' + (row.max_drawdown_zar / 1e6).toFixed(1) + 'M'}</span> },
];

const BEX_COLS: Column<TraderOrder>[] = [
  { key: 'energy_type', header: 'Instrument' },
  { key: 'side',        header: 'Side', render: row => (
    <span style={{ fontWeight: 700, color: row.side === 'buy' ? 'var(--oe-green)' : 'var(--oe-rose)' }}>{row.side === 'buy' ? 'Buy' : 'Sell'}</span>
  )},
  { key: 'volume_mwh',  header: 'Volume',  align: 'right', mono: true, render: row => <span>{row.volume_mwh} MWh</span> },
  { key: 'price',       header: 'Price',   align: 'right', mono: true, render: row => <span>{row.price != null ? `R${row.price.toLocaleString()}` : '—'}</span> },
  { key: 'status',      header: 'Status',  render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
];

const AUDIT_COLS: Column<AuditBlock>[] = [
  { key: 'id',        header: 'Ref',     mono: true, render: row => <span style={{ fontFamily: 'var(--oe-font-mono)' }}>{row.id.slice(-8)}</span> },
  { key: 'action',    header: 'Action',  mono: true },
  { key: 'actor_name',header: 'Actor',   render: row => <span>{row.actor_name ?? row.actor_id}</span> },
  { key: 'timestamp', header: 'Date',    align: 'right', mono: true,
    render: row => <span>{new Date(row.timestamp).toLocaleString()}</span> },
];

// ─── Order DetailDrawer builder ───────────────────────────────────────────────

function buildOrderDrawerFields(order: TraderOrder): DrawerField[] {
  return [
    { label: 'Order ID',    value: order.id,                       mono: true },
    { label: 'Instrument',  value: order.energy_type },
    { label: 'Side',        value: order.side === 'buy' ? 'Buy' : 'Sell' },
    { label: 'Instruction', value: order.instruction,              mono: true },
    { label: 'Volume',      value: `${order.volume_mwh} MWh`,      mono: true },
    { label: 'Remaining',   value: `${order.remaining_volume_mwh} MWh`, mono: true },
    { label: 'Limit Price', value: order.price != null ? `R${order.price.toLocaleString()}/MWh` : '—', mono: true },
    { label: 'Delivery',    value: order.delivery_date ?? '—',     mono: true },
    { label: 'Created',     value: order.created_at ? new Date(order.created_at).toLocaleString() : '—', mono: true },
    { label: 'Filled At',   value: order.filled_at ? new Date(order.filled_at).toLocaleString() : '—', mono: true },
  ];
}

function buildOrderDrawerActions(order: TraderOrder, refetch: () => void): DrawerAction[] {
  const canCancel = order.status === 'open' || order.status === 'partial';
  return [
    {
      id: 'cancel',
      label: 'Cancel Order',
      icon: 'flag',
      variant: 'danger',
      disabled: !canCancel,
      disabledReason: canCancel ? undefined : `Order is ${order.status} — cannot cancel`,
      onClick: async () => {
        await apexClient.trader.cancelOrder(order.id);
        refetch();
      },
    },
  ];
}

// ─── Audit block DetailDrawer builder ────────────────────────────────────────

function buildAuditDrawerFields(block: AuditBlock): DrawerField[] {
  return [
    { label: 'Ref',         value: block.id,                                    mono: true, span: true },
    { label: 'Seq',         value: String(block.seq),                           mono: true },
    { label: 'Action',      value: block.action,                                mono: true },
    { label: 'Entity Type', value: block.entity_type,                           mono: true },
    { label: 'Entity ID',   value: block.entity_id,                             mono: true },
    { label: 'Actor',       value: block.actor_name ?? block.actor_id },
    { label: 'Actor Role',  value: block.actor_role ?? '—' },
    { label: 'Timestamp',   value: new Date(block.timestamp).toLocaleString(),  mono: true },
    { label: 'Hash',        value: block.hash.slice(0, 16) + '…',               mono: true },
    { label: 'Prev Hash',   value: block.prev_hash ? block.prev_hash.slice(0, 16) + '…' : 'genesis', mono: true },
  ];
}

// ─── Screen components ────────────────────────────────────────────────────────

function OrdersScreen() {
  const { data, loading, refetch } = useTraderOrders();
  const [selected, setSelected] = React.useState<TraderOrder | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Orders</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' orders'}</div>
      </div>
      <DataTable
        columns={ORDER_FULL_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `${selected.side === 'buy' ? 'Buy' : 'Sell'} ${selected.energy_type}` : ''}
        subtitle={selected?.instruction ?? undefined}
        entityRef={selected?.id ?? undefined}
        status={selected?.status}
        statusVariant={selected ? stateVariant(selected.status) : 'default'}
        fields={selected ? buildOrderDrawerFields(selected) : []}
        actions={selected ? buildOrderDrawerActions(selected, refetch) : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

function PositionsScreen() {
  const { data, loading } = useTraderPositions();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Positions</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' books'}</div>
      </div>
      <AIInsightCard
        title="Position Limit Breach Warning — Wind Energy Net Long 94%"
        suggestion="Trader account TRD-0044 has reached 94% of their approved wind energy net long position limit (current: R47M vs R50M limit). A single additional standard contract (R2.5M) would trigger an automatic order rejection. Review the trader's open order book — there are 2 pending buy orders totalling R4.2M that, if filled, would breach the limit and trigger a forced partial liquidation."
        reasoning="FSCA §41 position limit rules: the platform must prevent positions from exceeding approved limits. The forced liquidation at limit breach (vs a soft warning at 90%) is a pre-trade guard — it cannot be waived in real-time. The trader should either reduce open orders or request a temporary limit increase from the risk desk before the afternoon trading session peak."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable
        columns={POSITION_COLS}
        rows={data}
        loading={loading}
        onRowClick={_row => {
          // TraderPosition has no id — open an inline info panel instead
        }}
      />
      {/* Inline info panel for positions (no drawer — no id field on TraderPosition) */}
      <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '14px 18px', boxShadow: 'var(--oe-shadow-card)' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
          Position Limit Summary
        </div>
        {loading ? (
          <div style={{ color: 'var(--oe-text-3)', fontSize: '13px' }}>Loading…</div>
        ) : data.length === 0 ? (
          <div style={{ color: 'var(--oe-text-3)', fontSize: '13px' }}>No open positions</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.map(pos => (
              <div key={pos.energy_type} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--oe-border-2)' }}>
                <div style={{ width: '100px', fontSize: '12px', fontWeight: 600, color: 'var(--oe-text-1)', flexShrink: 0 }}>{pos.energy_type}</div>
                <div style={{ width: '100px', fontSize: '12px', fontFamily: 'var(--oe-font-mono)', color: pos.net_mwh < 0 ? 'var(--oe-rose)' : pos.net_mwh > 0 ? 'var(--oe-green)' : 'var(--oe-text-3)', flexShrink: 0 }}>
                  {pos.net_mwh >= 0 ? '+' : ''}{pos.net_mwh} MWh net
                </div>
                <div style={{ flex: 1, height: '6px', background: 'var(--oe-surf-2)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(pos.utilisation_pct, 100)}%`, background: pos.utilisation_pct > 90 ? 'var(--oe-rose)' : pos.utilisation_pct > 70 ? 'var(--oe-amber)' : 'var(--oe-green)', borderRadius: '3px', transition: 'width 400ms var(--oe-ease)' }} />
                </div>
                <div style={{ width: '50px', textAlign: 'right', fontSize: '11px', fontFamily: 'var(--oe-font-mono)', color: pos.utilisation_pct > 90 ? 'var(--oe-rose)' : 'var(--oe-text-3)', flexShrink: 0 }}>
                  {pos.utilisation_pct.toFixed(1)}%
                </div>
                <div style={{ width: '80px', textAlign: 'right', fontSize: '11px', fontFamily: 'var(--oe-font-mono)', color: 'var(--oe-text-3)', flexShrink: 0 }}>
                  lim {pos.limit_mw} MW
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BookScreen() {
  const { data, loading, refetch } = useTraderOrders({ status: 'open' });
  const [selected, setSelected] = React.useState<TraderOrder | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const buys = data.filter(o => o.side === 'buy');
  const sells = data.filter(o => o.side === 'sell');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Order Book</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : `${buys.length} bids · ${sells.length} asks`}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--oe-green)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bids</div>
          <DataTable columns={ORDER_COLS} rows={buys} loading={loading} compact onRowClick={row => { setSelected(row); setDrawerOpen(true); }} />
        </div>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--oe-rose)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Asks</div>
          <DataTable columns={ORDER_COLS} rows={sells} loading={loading} compact onRowClick={row => { setSelected(row); setDrawerOpen(true); }} />
        </div>
      </div>
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `${selected.side === 'buy' ? 'Bid' : 'Ask'} — ${selected.energy_type}` : ''}
        subtitle={selected ? `${selected.volume_mwh} MWh · ${selected.instruction}` : undefined}
        entityRef={selected?.id ?? undefined}
        status={selected?.status}
        statusVariant={selected ? stateVariant(selected.status) : 'default'}
        fields={selected ? buildOrderDrawerFields(selected) : []}
        actions={selected ? buildOrderDrawerActions(selected, refetch) : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

function RiskScreen() {
  const { data, loading } = useTraderPnl();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Risk Dashboard</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' periods'}</div>
      </div>
      {/* TraderPnl has no id — display as read-only summary without drawer */}
      <DataTable
        columns={PNL_COLS}
        rows={data}
        loading={loading}
        onRowClick={_row => {
          // TraderPnl has no id field — no drawer; static display only
        }}
      />
      {!loading && data.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {[
            { label: 'Total Net P&L', value: `R${(data.reduce((s, r) => s + r.net_pnl_zar, 0) / 1e6).toFixed(2)}M`, positive: data.reduce((s, r) => s + r.net_pnl_zar, 0) >= 0 },
            { label: 'Peak VaR', value: `R${(Math.max(...data.map(r => r.var_zar)) / 1e6).toFixed(2)}M`, positive: true },
            { label: 'Avg Sharpe', value: (data.reduce((s, r) => s + r.sharpe, 0) / data.length).toFixed(2), positive: data.reduce((s, r) => s + r.sharpe, 0) / data.length >= 1 },
          ].map(item => (
            <div key={item.label} style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '14px 16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{item.label}</div>
              <div style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'var(--oe-font-mono)', color: item.positive ? 'var(--oe-green)' : 'var(--oe-rose)' }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BexScreen() {
  const { data, loading, refetch } = useTraderOrders({ limit: 50 });
  const [selected, setSelected] = React.useState<TraderOrder | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>RFQ / Best Execution</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' orders'}</div>
      </div>
      <AIInsightCard
        title="Best Execution Review — 2 Outlier Trades Detected"
        suggestion="The quarterly best-execution report (Q1 2026) flags 2 OTC trades where the executed price deviated >15bps from the VWAP benchmark: RFQ-2026-0142 (wind energy, -18bps) and RFQ-2026-0203 (PV forward, +21bps). Both trades require a documented exception justification filed within 5 business days of the quarterly report. Draft the justifications now while trade context is fresh."
        reasoning="FSCA Conduct Standard 1/2020 §6.2: best execution obligations require that any deviation >10bps from the contemporaneous benchmark must be documented with a client-impact assessment. Undocumented deviations discovered during a FSCA inspection are treated as systematic best-execution failures and carry administrative sanctions up to R5M per violation. The 5-day documentation window is a platform rule, not a regulatory one — but it ensures the justifications are prepared while the trading context is available."
        confidence="medium"
        onAccept={() => {}}
      />
      <DataTable
        columns={BEX_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <ActionPanel
        title="Best Execution Actions"
        actions={[
          {
            id: 'rfq-new',
            label: 'Request for Quote',
            description: 'Send bilateral RFQ to counterparties',
            icon: 'send',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Send RFQ"
                requireReason={false}
                fields={[
                  { key: 'instrument', label: 'Instrument', type: 'select', required: true, options: [
                    { value: 'SOLAR-DAH', label: 'SOLAR-DAH-2026-06' },
                    { value: 'WIND-DAH',  label: 'WIND-DAH-2026-06' },
                    { value: 'PEAK-DAH',  label: 'PEAK-DAH-2026-06' },
                    { value: 'BASE-DAH',  label: 'BASE-DAH-2026-06' },
                  ]},
                  { key: 'side', label: 'Side', type: 'select', required: true, options: [
                    { value: 'buy', label: 'Buy' },
                    { value: 'sell', label: 'Sell' },
                  ]},
                  { key: 'quantity', label: 'Quantity (MWh)', type: 'number', required: true, placeholder: '0' },
                ]}
                onSubmit={async rfqData => { await apexClient.trader.placeOrder({ ...rfqData, instruction: 'market' }); refetch(); }}
              />
            ),
          },
        ]}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `Best-Ex — ${selected.energy_type}` : ''}
        subtitle={selected ? `${selected.side.toUpperCase()} ${selected.volume_mwh} MWh` : undefined}
        entityRef={selected?.id ?? undefined}
        status={selected?.status}
        statusVariant={selected ? stateVariant(selected.status) : 'default'}
        fields={selected ? buildOrderDrawerFields(selected) : []}
        actions={selected ? buildOrderDrawerActions(selected, refetch) : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

function SurveillanceScreen() {
  const { data, loading, refetch } = useTraderOrders({ limit: 20 });
  const [selected, setSelected] = React.useState<TraderOrder | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Market Abuse Surveillance</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' flagged'}</div>
      </div>
      <div style={{ background: 'var(--oe-rose-bg)', border: '1px solid var(--oe-rose)', borderRadius: 'var(--oe-r-card)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <OeIcon name="shield" size={14} color="var(--oe-rose)" />
        <span style={{ fontSize: '13px', color: 'var(--oe-rose)', fontWeight: 500 }}>
          STOR alert active — pattern detected on recent orders. Review and file suspicious transaction report if required.
        </span>
      </div>
      <DataTable
        columns={BEX_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <ActionPanel
        title="Surveillance Actions"
        actions={[
          {
            id: 'file-stor',
            label: 'File STOR Report',
            description: 'Submit suspicious transaction report to FSCA',
            icon: 'flag',
            variant: 'danger',
            form: (
              <TransitionForm
                actionLabel="File STOR"
                requireReason={true}
                fields={[
                  { key: 'order_ref', label: 'Order Reference', type: 'text', required: true, placeholder: 'ORD-...' },
                  { key: 'abuse_type', label: 'Abuse Type', type: 'select', required: true, options: [
                    { value: 'front_running', label: 'Front Running' },
                    { value: 'spoofing',      label: 'Spoofing / Layering' },
                    { value: 'wash_trading',  label: 'Wash Trading' },
                    { value: 'ramping',       label: 'Ramping' },
                    { value: 'other',         label: 'Other' },
                  ]},
                ]}
                onSubmit={async _formData => {
                  await apexClient.audit.listBlocks({ entity_type: 'market_abuse_case' });
                  refetch();
                }}
              />
            ),
          },
          {
            id: 'clear-alert',
            label: 'Clear Alert',
            description: 'Mark surveillance alert as reviewed — no action',
            icon: 'check-circle',
            variant: 'secondary',
            onClick: async () => {
              await apexClient.trader.listOrders({ limit: 20 });
              refetch();
            },
          },
        ]}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `Surveillance — ${selected.energy_type}` : ''}
        subtitle={selected ? `${selected.side.toUpperCase()} ${selected.volume_mwh} MWh` : undefined}
        entityRef={selected?.id ?? undefined}
        status={selected?.status}
        statusVariant={selected ? stateVariant(selected.status) : 'default'}
        fields={selected ? buildOrderDrawerFields(selected) : []}
        actions={selected ? [
          {
            id: 'file-stor-single',
            label: 'File STOR on This Order',
            icon: 'flag',
            variant: 'danger',
            onClick: async () => {
              await apexClient.audit.listBlocks({ entity_type: 'market_abuse_case', entity_id: selected.id });
              refetch();
            },
          },
          ...buildOrderDrawerActions(selected, refetch),
        ] : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

function AlgoScreen() {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'algo_certification' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Algorithmic Trading Certification</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : `${data.length} audit events`}</div>
      </div>
      <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <OeIcon name="gear" size={14} color="var(--oe-text-3)" />
        <span style={{ fontSize: '13px', color: 'var(--oe-text-2)' }}>
          W60 — FMA/FSCA/MiFID RTS6 pre-deployment governance gate. Certified systems only. Kill-switch activation crosses regulator every tier.
        </span>
      </div>
      <AIInsightCard
        title="Algo Certification Expiry — 23 Days Remaining"
        suggestion="ALGO-SYS-001 (Market-Making Algo v2.4) certification expires 24 Jun 2026. FMA RTS6 requires annual recertification before the expiry date. The recertification requires a 5-day live-market test period on a test environment plus a 3-day FSCA review. Submit the recertification application today to ensure certification remains continuous — a lapse suspends the algo from live order submission."
        reasoning="FSCA Conduct Standard §8.3: algorithmic trading systems must be certified before deployment and recertified annually. A certification lapse requires immediate withdrawal of the system from live markets. The market-making obligation requires continuous quote presence during trading hours — a suspension triggers a MM compliance breach (W9) if it extends more than 15 minutes during a mandatory quoting period."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable
        columns={AUDIT_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <ActionPanel
        title="Certification Actions"
        actions={[
          {
            id: 'initiate-cert',
            label: 'Initiate Certification',
            description: 'Submit new algo system for pre-deployment review',
            icon: 'gear',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Submit for Certification"
                requireReason={false}
                fields={[
                  { key: 'system_name', label: 'System Name', type: 'text', required: true, placeholder: 'e.g. ArbitrageBot-v3' },
                  { key: 'algo_type', label: 'Algorithm Type', type: 'select', required: true, options: [
                    { value: 'market_making', label: 'Market Making' },
                    { value: 'arbitrage',     label: 'Arbitrage' },
                    { value: 'execution',     label: 'Execution' },
                    { value: 'hedging',       label: 'Hedging' },
                  ]},
                  { key: 'max_order_rate', label: 'Max Order Rate (per sec)', type: 'number', required: true, placeholder: '10' },
                ]}
                onSubmit={async _formData => {
                  await apexClient.audit.listBlocks({ entity_type: 'algo_certification' });
                  refetch();
                }}
              />
            ),
          },
          {
            id: 'invoke-kill',
            label: 'Invoke Kill Switch',
            description: 'Emergency halt — crosses regulator immediately',
            icon: 'flag',
            variant: 'danger',
            form: (
              <TransitionForm
                actionLabel="Invoke Kill Switch"
                requireReason={true}
                fields={[
                  { key: 'system_id', label: 'System ID', type: 'text', required: true, placeholder: 'ACO-...' },
                ]}
                onSubmit={async _formData => {
                  await apexClient.audit.listBlocks({ entity_type: 'algo_certification' });
                  refetch();
                }}
              />
            ),
          },
        ]}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `Algo Cert Event — ${selected.action}` : ''}
        subtitle={selected ? `Entity: ${selected.entity_id.slice(-12)}` : undefined}
        entityRef={selected ? selected.id.slice(-8) : undefined}
        fields={selected ? buildAuditDrawerFields(selected) : []}
        actions={selected ? [
          {
            id: 'view-chain',
            label: 'Fetch Audit Chain',
            icon: 'list',
            variant: 'secondary',
            onClick: async () => {
              await apexClient.audit.listBlocks({ entity_type: 'algo_certification', entity_id: selected.entity_id });
              refetch();
            },
          },
        ] : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

function ReportingScreen() {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'trade_report' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Trade Reporting</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : `${data.length} report events`}</div>
      </div>
      <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <OeIcon name="report" size={14} color="var(--oe-text-3)" />
        <span style={{ fontSize: '13px', color: 'var(--oe-text-2)' }}>
          W44 — FMA 2012 + FSCA post-trade OTC trade-repository reporting. SLA breach is itself a violation and crosses regulator on every tier.
        </span>
      </div>
      <DataTable
        columns={AUDIT_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <ActionPanel
        title="Reporting Actions"
        actions={[
          {
            id: 'submit-report',
            label: 'Submit Trade Report',
            description: 'T+1 OTC trade-repository submission to FSCA',
            icon: 'send',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Submit Report"
                requireReason={false}
                fields={[
                  { key: 'trade_ref', label: 'Trade Reference', type: 'text', required: true, placeholder: 'TRD-...' },
                  { key: 'reporting_regime', label: 'Reporting Regime', type: 'select', required: true, options: [
                    { value: 'fsca_otc',  label: 'FSCA OTC (FMA 2012)' },
                    { value: 'emir_like', label: 'EMIR-equivalent' },
                  ]},
                  { key: 'notional_zar', label: 'Notional (ZAR)', type: 'number', required: true, placeholder: '0' },
                ]}
                onSubmit={async _formData => {
                  await apexClient.audit.listBlocks({ entity_type: 'trade_report' });
                  refetch();
                }}
              />
            ),
          },
          {
            id: 'reconcile',
            label: 'Reconcile Open Reports',
            description: 'Check submission status against FSCA registry',
            icon: 'scales',
            variant: 'secondary',
            onClick: async () => {
              await apexClient.audit.listBlocks({ entity_type: 'trade_report' });
              refetch();
            },
          },
        ]}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `Report Event — ${selected.action}` : ''}
        subtitle={selected ? `Entity: ${selected.entity_id.slice(-12)}` : undefined}
        entityRef={selected ? selected.id.slice(-8) : undefined}
        fields={selected ? buildAuditDrawerFields(selected) : []}
        actions={selected ? [
          {
            id: 'resubmit',
            label: 'Resubmit to Repository',
            icon: 'send',
            variant: 'primary',
            onClick: async () => {
              await apexClient.audit.listBlocks({ entity_type: 'trade_report', entity_id: selected.entity_id });
              refetch();
            },
          },
        ] : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

function AllocationsScreen() {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'trade_allocation' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Trade Allocations</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : `${data.length} allocation events`}</div>
      </div>
      <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <OeIcon name="hierarchy" size={14} color="var(--oe-text-3)" />
        <span style={{ fontSize: '13px', color: 'var(--oe-text-2)' }}>
          W76 — DTCC-ITP/Omgeo-CTM post-execution institutional processing. Block-to-account breakdown, CSDR break review, affirmation. Flag-break crosses regulator every tier.
        </span>
      </div>
      <AIInsightCard
        title="Block Trade Allocation Deadline — 3 Sub-Accounts Pending"
        suggestion="Block trade ALLOC-2026-0089 (15,000 MWh, R4.2M) has 3 sub-account allocations pending confirmation (accounts: Kalahari Fund, Umoya Infra, SA Wind Partners). CSDR T+1 deadline is tomorrow at 10:00. Two counterparties have not responded to the affirmation request. Send a follow-up now — if sub-accounts are not confirmed by T+1, the trade enters the break-review cycle and may fail settlement."
        reasoning="DTCC ITP/Omgeo CTM industry practice: block trade allocations must be affirmed by all sub-accounts by T+1 10:00 to settle on T+2. A break at this stage triggers the CSDR mandatory buy-in framework if the failure extends to T+4 — the buy-in penalty is up to 10bps of the notional on the unallocated portion. Early follow-up at T+0 is the most effective intervention point."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable
        columns={AUDIT_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <ActionPanel
        title="Allocation Actions"
        actions={[
          {
            id: 'allocate-block',
            label: 'Allocate Block Trade',
            description: 'Split executed block into per-account sub-allocations',
            icon: 'hierarchy',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Submit Allocation"
                requireReason={false}
                fields={[
                  { key: 'block_ref', label: 'Block Trade Ref', type: 'text', required: true, placeholder: 'BLK-...' },
                  { key: 'account_count', label: 'Number of Accounts', type: 'number', required: true, placeholder: '1' },
                  { key: 'notional_zar', label: 'Total Notional (ZAR)', type: 'number', required: true, placeholder: '0' },
                ]}
                onSubmit={async _formData => {
                  await apexClient.audit.listBlocks({ entity_type: 'trade_allocation' });
                  refetch();
                }}
              />
            ),
          },
          {
            id: 'flag-break',
            label: 'Flag Break',
            description: 'CSDR break — crosses regulator immediately',
            icon: 'flag',
            variant: 'danger',
            form: (
              <TransitionForm
                actionLabel="Flag Break"
                requireReason={true}
                fields={[
                  { key: 'allocation_ref', label: 'Allocation Ref', type: 'text', required: true, placeholder: 'ALLOC-...' },
                  { key: 'break_type', label: 'Break Type', type: 'select', required: true, options: [
                    { value: 'quantity', label: 'Quantity Mismatch' },
                    { value: 'price',    label: 'Price Mismatch' },
                    { value: 'account',  label: 'Account Error' },
                    { value: 'fails',    label: 'Settlement Fails' },
                  ]},
                ]}
                onSubmit={async _formData => {
                  await apexClient.audit.listBlocks({ entity_type: 'trade_allocation' });
                  refetch();
                }}
              />
            ),
          },
        ]}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `Allocation Event — ${selected.action}` : ''}
        subtitle={selected ? `Entity: ${selected.entity_id.slice(-12)}` : undefined}
        entityRef={selected ? selected.id.slice(-8) : undefined}
        fields={selected ? buildAuditDrawerFields(selected) : []}
        actions={selected ? [
          {
            id: 'affirm',
            label: 'Affirm Allocation',
            icon: 'check-circle',
            variant: 'primary',
            onClick: async () => {
              await apexClient.audit.listBlocks({ entity_type: 'trade_allocation', entity_id: selected.entity_id });
              refetch();
            },
          },
          {
            id: 'reject-alloc',
            label: 'Reject Allocation',
            icon: 'flag',
            variant: 'danger',
            onClick: async () => {
              await apexClient.audit.listBlocks({ entity_type: 'trade_allocation', entity_id: selected.entity_id });
              refetch();
            },
          },
        ] : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

function MarginScreen() {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'counterparty_margin' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Counterparty Margin</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : `${data.length} margin events`}</div>
      </div>
      <div style={{ background: 'var(--oe-amber-bg, rgba(245,158,11,0.08))', border: '1px solid var(--oe-amber)', borderRadius: 'var(--oe-r-card)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <OeIcon name="scales" size={14} color="var(--oe-amber)" />
        <span style={{ fontSize: '13px', color: 'var(--oe-amber)', fontWeight: 500 }}>
          W68 — CPMI-IOSCO PFMI counterparty-credit waterfall. Margin call active. Declare-default crosses regulator every tier.
        </span>
      </div>
      <AIInsightCard
        title="Margin Call Escalation — Eskom Trading Desk Unresponsive"
        suggestion="CCM-2026-0003 (Eskom Trading Desk, R6.8M variation margin call, issued 09:00 today) has reached the 4-hour response deadline without payment or written objection. FMA §34 default management procedures activate automatically at hour 4. Initiate the formal escalation: send a default notice and begin the close-out netting calculation on all open Eskom positions."
        reasoning="FMA §34 + CPMI-IOSCO PFMI Principle 7: when a margin call is unmet for 4 hours without a formal dispute, the central counterparty must begin default management procedures. Waiting beyond the 4-hour window increases the platform's exposure to Eskom's mark-to-market position, which is currently R14.2M adverse. The close-out netting calculation should be initiated even if Eskom ultimately pays — it can be withdrawn if payment arrives within the next 2 hours."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable
        columns={AUDIT_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <ActionPanel
        title="Margin Actions"
        actions={[
          {
            id: 'issue-margin-call',
            label: 'Issue Margin Call',
            description: 'Formal margin demand to counterparty',
            icon: 'scales',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Issue Margin Call"
                requireReason={false}
                fields={[
                  { key: 'counterparty', label: 'Counterparty', type: 'text', required: true, placeholder: 'Entity name' },
                  { key: 'call_amount_zar', label: 'Call Amount (ZAR)', type: 'number', required: true, placeholder: '0' },
                  { key: 'due_date', label: 'Due Date', type: 'date', required: true },
                ]}
                onSubmit={async _formData => {
                  await apexClient.audit.listBlocks({ entity_type: 'counterparty_margin' });
                  refetch();
                }}
              />
            ),
          },
          {
            id: 'declare-default',
            label: 'Declare Default',
            description: 'Default event — CPMI-IOSCO waterfall triggered',
            icon: 'flag',
            variant: 'danger',
            form: (
              <TransitionForm
                actionLabel="Declare Default"
                requireReason={true}
                fields={[
                  { key: 'counterparty', label: 'Counterparty', type: 'text', required: true, placeholder: 'Entity name' },
                  { key: 'default_type', label: 'Default Type', type: 'select', required: true, options: [
                    { value: 'margin_failure', label: 'Margin Failure' },
                    { value: 'delivery_failure', label: 'Delivery Failure' },
                    { value: 'insolvency', label: 'Insolvency' },
                  ]},
                ]}
                onSubmit={async _formData => {
                  await apexClient.audit.listBlocks({ entity_type: 'counterparty_margin' });
                  refetch();
                }}
              />
            ),
          },
          {
            id: 'close-out',
            label: 'Close-Out Netting',
            description: 'Trigger close-out netting process',
            icon: 'scales',
            variant: 'secondary',
            onClick: async () => {
              await apexClient.audit.listBlocks({ entity_type: 'counterparty_margin' });
              refetch();
            },
          },
        ]}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `Margin Event — ${selected.action}` : ''}
        subtitle={selected ? `Entity: ${selected.entity_id.slice(-12)}` : undefined}
        entityRef={selected ? selected.id.slice(-8) : undefined}
        fields={selected ? buildAuditDrawerFields(selected) : []}
        actions={selected ? [
          {
            id: 'view-waterfall',
            label: 'View Default Fund Waterfall',
            icon: 'scales',
            variant: 'secondary',
            onClick: async () => {
              await apexClient.audit.listBlocks({ entity_type: 'counterparty_margin', entity_id: selected.entity_id });
              refetch();
            },
          },
        ] : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

// ─── Sub-screen: MM Compliance (W9) ──────────────────────────────────────────

type MmRow = {
  id: string;
  ref: string;
  instrument: string;
  miss_count: number;
  chain_status: string;
  breach_date: string | null;
  tier: string;
  // Obligation fields from backend
  energy_type: string;
  obligation_type: string;
  consecutive_misses: number | null;
  breach_status: string | null;
  last_breach_at: string | null;
  last_escalated_at: string | null;
  last_acknowledged_at: string | null;
  performance_score: number | null;
  status: string;
};

const MM_COLS: Column<MmRow>[] = [
  { key: 'ref', header: 'Ref', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{row.id.slice(-8).toUpperCase()}</span>
  },
  { key: 'instrument',         header: 'Instrument',   render: row => <span>{row.energy_type ?? row.instrument}</span> },
  { key: 'obligation_type',    header: 'Type',         render: row => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{row.obligation_type}</span> },
  { key: 'miss_count',         header: 'Misses',       align: 'right', mono: true,
    render: row => {
      const n = row.consecutive_misses ?? 0;
      return <span style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: n >= 3 ? 'var(--oe-rose)' : n >= 1 ? 'var(--oe-amber)' : 'var(--oe-text-3)' }}>{n}</span>;
    }
  },
  { key: 'chain_status',       header: 'Breach Status',
    render: row => <StatusPill label={row.breach_status ?? row.status ?? 'none'} variant={stateVariant(row.breach_status ?? row.status ?? 'none')} />
  },
  { key: 'breach_date',        header: 'Last Breach',  align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{(row.last_breach_at ?? row.breach_date) ? (row.last_breach_at ?? row.breach_date ?? '').slice(0, 10) : '—'}</span>
  },
];

function mmDrawerFields(row: MmRow): DrawerField[] {
  return [
    { label: 'Obligation ID',    value: row.id,                                                                              mono: true, span: true },
    { label: 'Instrument',       value: row.energy_type ?? row.instrument },
    { label: 'Obligation Type',  value: row.obligation_type },
    { label: 'Status',           value: row.status,                                                                         mono: true },
    { label: 'Consecutive Misses', value: String(row.consecutive_misses ?? 0),                                              mono: true },
    { label: 'Breach Status',    value: <StatusPill label={row.breach_status ?? 'none'} variant={stateVariant(row.breach_status ?? 'none')} />, span: true },
    { label: 'Performance Score', value: row.performance_score != null ? row.performance_score.toFixed(2) + '%' : '—',      mono: true },
    { label: 'Last Breach At',   value: row.last_breach_at ? row.last_breach_at.slice(0, 10) : '—',                        mono: true },
    { label: 'Last Escalated',   value: row.last_escalated_at ? row.last_escalated_at.slice(0, 10) : '—',                  mono: true },
    { label: 'Last Acknowledged', value: row.last_acknowledged_at ? row.last_acknowledged_at.slice(0, 10) : '—',           mono: true },
  ];
}

function mmDrawerActions(row: MmRow, onDone: () => void): DrawerAction[] {
  const actions: DrawerAction[] = [];
  const breachStatus = row.breach_status ?? 'none';

  if (breachStatus === 'none' || breachStatus === 'warning') {
    actions.push({
      id: 'record-performance',
      label: 'Record Daily Performance',
      icon: 'chart-line',
      variant: 'primary',
      form: (
        <TransitionForm
          actionLabel="Record Performance"
          requireReason={false}
          fields={[
            { key: 'uptime_pct', label: 'Uptime %', type: 'number', required: true, placeholder: '100' },
            { key: 'spread_bps', label: 'Spread (bps)', type: 'number', required: false, placeholder: '0' },
            { key: 'quote_volume_mwh', label: 'Quote Volume (MWh)', type: 'number', required: false, placeholder: '0' },
          ]}
          onSubmit={async (formData) => {
            await api.post(`/api/trader/mm-compliance/${row.id}/performance`, formData);
            onDone();
          }}
        />
      ),
      onClick: async () => { /* form handles submission */ },
    });
  }

  if (breachStatus === 'breach' || breachStatus === 'escalated') {
    actions.push({
      id: 'acknowledge-breach',
      label: 'Acknowledge Breach',
      icon: 'checklist',
      variant: 'secondary',
      form: (
        <TransitionForm
          actionLabel="Acknowledge Breach"
          reasonCodes={[
            { value: 'system_outage',      label: 'System outage — force majeure' },
            { value: 'market_conditions',  label: 'Extreme market conditions' },
            { value: 'operational_error',  label: 'Operational error — remediated' },
          ]}
          onSubmit={async (formData) => {
            await api.post(`/api/trader/mm-compliance/${row.id}/acknowledge`, formData);
            onDone();
          }}
        />
      ),
      onClick: async () => { /* form handles submission */ },
    });
  }

  if (breachStatus === 'escalated') {
    actions.push({
      id: 'clear-escalation',
      label: 'Clear Escalation',
      icon: 'approve',
      variant: 'primary',
      form: (
        <TransitionForm
          actionLabel="Clear Escalation"
          reasonCodes={[
            { value: 'remediation_complete', label: 'Remediation plan accepted by regulator' },
            { value: 'cure_period_passed',   label: 'Cure period elapsed — 3 consecutive compliant days' },
          ]}
          confirmMessage="Clearing this escalation will return the obligation to monitored status. Performance record must show 3 consecutive compliant days."
          onSubmit={async (formData) => {
            await api.post(`/api/trader/mm-compliance/${row.id}/clear`, formData);
            onDone();
          }}
        />
      ),
      onClick: async () => { /* form handles submission */ },
    });
  }

  actions.push({
    id: 'view-performance',
    label: 'View Performance History',
    icon: 'list',
    variant: 'secondary',
    onClick: async () => {
      await api.get(`/api/trader/mm-compliance/${row.id}`);
      onDone();
    },
  });

  return actions;
}

function MmComplianceScreen() {
  const [rows, setRows] = React.useState<MmRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<MmRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const fetch = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/trader/mm-compliance');
      setRows((res.data?.data ?? res.data?.results ?? res.data ?? []) as MmRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetch(); }, [fetch]);

  const breachedCount = rows.filter(r => (r.breach_status ?? 'none') !== 'none').length;
  const escalatedCount = rows.filter(r => r.breach_status === 'escalated').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Market-Maker Compliance
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' obligations'}</div>
      </div>

      {escalatedCount > 0 && (
        <div style={{ background: 'var(--oe-rose-bg)', border: '1px solid var(--oe-rose)', borderRadius: 'var(--oe-r-card)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <OeIcon name="shield" size={14} color="var(--oe-rose)" />
          <span style={{ fontSize: '13px', color: 'var(--oe-rose)', fontWeight: 500 }}>
            {escalatedCount} obligation{escalatedCount > 1 ? 's' : ''} escalated to regulator — remediation acknowledgement required.
          </span>
        </div>
      )}

      <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '12px 16px', fontSize: '12px', color: 'var(--oe-text-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <OeIcon name="shield" size={14} />
        W9 MM Compliance — consecutive-miss breach machine: none → warning → breach → escalated. FSCA CONDUCT STANDARD 1/2020. Escalation crosses regulator. {breachedCount > 0 ? breachedCount + ' obligations in breach.' : 'All obligations within thresholds.'}
      </div>

      <AIInsightCard
        suggestion="Energy-peak desk missed 3 consecutive market-making windows this week (09:00-09:30 on Mon/Tue/Wed), triggering the FSCA Conduct Standard warning threshold. One more miss this week escalates to a formal breach notification."
        reasoning="FSCA Conduct Standard 1/2020 §4.2 requires market makers to maintain bid-offer presence in 90% of prescribed windows. A formal breach results in a public register entry and potential suspension of MM designation."
        title="Review MM Schedule"
        onAccept={() => {}}
      />

      <DataTable
        columns={MM_COLS}
        rows={rows}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />

      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? (selected.energy_type ?? selected.instrument) + ' — ' + selected.obligation_type : 'MM Obligation'}
        subtitle={selected ? 'Consecutive misses: ' + (selected.consecutive_misses ?? 0) : undefined}
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        status={selected?.breach_status ?? selected?.status}
        fields={selected ? mmDrawerFields(selected) : []}
        actions={selected ? mmDrawerActions(selected, () => { void fetch(); setDrawerOpen(false); }) : []}
        onActionComplete={fetch}
      />
    </div>
  );
}

// ─── Sub-screen: Settlement Fails & CSDR Buy-In (W85) ────────────────────────

type SettleFail = {
  id: string;
  ref: string;
  counterparty: string;
  instrument: string;
  fail_quantity: number;
  accrued_penalty_zar: number;
  chain_status: string;
  fail_date: string;
  tier: string;
};

const SETTLE_FAIL_COLS: Column<SettleFail>[] = [
  { key: 'ref',                  header: 'Ref',              mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{row.ref ?? row.id.slice(-8).toUpperCase()}</span> },
  { key: 'counterparty',         header: 'Counterparty',     render: row => <span style={{ fontSize: '13px' }}>{row.counterparty}</span> },
  { key: 'instrument',           header: 'Instrument',       render: row => <span style={{ fontSize: '13px' }}>{row.instrument}</span> },
  { key: 'fail_quantity',        header: 'Fail Qty',         align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{(row.fail_quantity ?? 0).toLocaleString()} MWh</span> },
  { key: 'accrued_penalty_zar',  header: 'Accrued Penalty',  align: 'right', mono: true,
    render: row => {
      const v = row.accrued_penalty_zar ?? 0;
      return <span style={{ fontFamily: '"JetBrains Mono", monospace', color: v > 0 ? 'var(--oe-rose)' : 'var(--oe-text-3)' }}>
        {v >= 1e6 ? `R${(v / 1e6).toFixed(2)}m` : `R${v.toLocaleString()}`}
      </span>;
    } },
  { key: 'chain_status',         header: 'Status',
    render: row => <StatusPill label={row.chain_status} variant={stateVariant(row.chain_status)} /> },
  { key: 'fail_date',            header: 'Fail Date',        align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{row.fail_date ? row.fail_date.slice(0, 10) : '—'}</span> },
];

function settleFailDrawerFields(row: SettleFail): DrawerField[] {
  return [
    { label: 'Ref',              value: row.ref ?? row.id,                         mono: true, span: true },
    { label: 'Counterparty',     value: row.counterparty },
    { label: 'Instrument',       value: row.instrument },
    { label: 'Fail Quantity',    value: `${(row.fail_quantity ?? 0).toLocaleString()} MWh`,   mono: true },
    { label: 'Accrued Penalty',  value: (() => { const v = row.accrued_penalty_zar ?? 0; return v >= 1e6 ? `R${(v / 1e6).toFixed(2)}m` : `R${v.toLocaleString()}`; })(), mono: true },
    { label: 'Status',           value: <StatusPill label={row.chain_status} variant={stateVariant(row.chain_status)} />, span: true },
    { label: 'Fail Date',        value: row.fail_date ? row.fail_date.slice(0, 10) : '—',     mono: true },
    { label: 'Tier',             value: row.tier ?? '—',                           mono: true },
  ];
}

function settleFailDrawerActions(row: SettleFail, onDone: () => void): DrawerAction[] {
  const actions: DrawerAction[] = [];
  const s = row.chain_status ?? '';

  if (s === 'open' || s === 'pending') {
    actions.push({
      id: 'initiate-buy-in',
      label: 'Initiate Buy-In',
      icon: 'flag',
      variant: 'danger',
      form: (
        <TransitionForm
          actionLabel="Initiate Buy-In"
          requireReason={true}
          fields={[
            { key: 'buy_in_agent', label: 'Buy-In Agent', type: 'text', required: true, placeholder: 'Agent name' },
            { key: 'buy_in_date',  label: 'Buy-In Date',  type: 'date', required: true },
          ]}
          onSubmit={async (formData) => {
            await api.post(`/api/settlement-fail/chain/${row.id}/transition`, { action: 'initiate_buy_in', ...formData });
            onDone();
          }}
        />
      ),
      onClick: async () => { /* form handles submission */ },
    });
    actions.push({
      id: 'close-cash',
      label: 'Close — Cash Settlement',
      icon: 'check-circle',
      variant: 'primary',
      form: (
        <TransitionForm
          actionLabel="Confirm Cash Close"
          requireReason={false}
          fields={[
            { key: 'cash_amount_zar', label: 'Cash Amount (ZAR)', type: 'number', required: true, placeholder: '0' },
          ]}
          onSubmit={async (formData) => {
            await api.post(`/api/settlement-fail/chain/${row.id}/transition`, { action: 'close_cash', ...formData });
            onDone();
          }}
        />
      ),
      onClick: async () => { /* form handles submission */ },
    });
  }

  if (s !== 'written_off' && s !== 'closed') {
    actions.push({
      id: 'write-off',
      label: 'Write Off',
      icon: 'flag',
      variant: 'danger',
      form: (
        <TransitionForm
          actionLabel="Confirm Write-Off"
          requireReason={true}
          reasonCodes={[
            { value: 'counterparty_default', label: 'Counterparty default — irrecoverable' },
            { value: 'agreed_waiver',        label: 'Bilaterally agreed waiver' },
            { value: 'de_minimis',           label: 'De minimis — below threshold' },
          ]}
          onSubmit={async (formData) => {
            await api.post(`/api/settlement-fail/chain/${row.id}/transition`, { action: 'write_off', ...formData });
            onDone();
          }}
        />
      ),
      onClick: async () => { /* form handles submission */ },
    });
  }

  actions.push({
    id: 'view-chain',
    label: 'View Audit Chain',
    icon: 'list',
    variant: 'secondary',
    onClick: async () => {
      await api.get(`/api/settlement-fail/chain/${row.id}`);
      onDone();
    },
  });

  return actions;
}

function SettlementFailsScreen() {
  const [rows, setRows] = React.useState<SettleFail[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<SettleFail | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const fetch = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/settlement-fail/chain');
      setRows((res.data?.data ?? res.data?.results ?? res.data ?? []) as SettleFail[]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetch(); }, [fetch]);

  const openCount     = rows.filter(r => r.chain_status === 'open' || r.chain_status === 'pending').length;
  const buyInCount    = rows.filter(r => r.chain_status === 'buy_in_initiated').length;
  const totalPenalty  = rows.reduce((s, r) => s + (r.accrued_penalty_zar ?? 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Settlement Fails &amp; CSDR Buy-In
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' fails'}</div>
      </div>

      {openCount > 0 && (
        <div style={{ background: 'var(--oe-rose-bg)', border: '1px solid var(--oe-rose)', borderRadius: 'var(--oe-r-card)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <OeIcon name="alert-triangle" size={14} color="var(--oe-rose)" />
          <span style={{ fontSize: '13px', color: 'var(--oe-rose)', fontWeight: 500 }}>
            {openCount} open fail{openCount > 1 ? 's' : ''} — CSDR cash penalty accruing.
            {buyInCount > 0 ? ` ${buyInCount} buy-in procedure${buyInCount > 1 ? 's' : ''} active.` : ''}
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {[
          { label: 'Open Fails',       value: String(openCount),    positive: openCount === 0 },
          { label: 'Buy-In Active',    value: String(buyInCount),   positive: buyInCount === 0 },
          { label: 'Total Accrued',    value: totalPenalty >= 1e6 ? `R${(totalPenalty / 1e6).toFixed(2)}m` : `R${totalPenalty.toLocaleString()}`, positive: totalPenalty === 0 },
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{item.label}</div>
            <div style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'var(--oe-font-mono)', color: item.positive ? 'var(--oe-green)' : 'var(--oe-rose)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '12px 16px', fontSize: '12px', color: 'var(--oe-text-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <OeIcon name="alert-triangle" size={14} />
        W85 — CSDR settlement discipline. Daily cash penalties accrue on open fails from T+2. Buy-in mandatory from T+7 for equity-type instruments. Crosses regulator on write-off every tier.
      </div>

      <AIInsightCard
        suggestion="Settlement fail on TRD-2026-0892 (R4.8M, Day+2 ETP) is now at Day+4. STRATE buy-in will automatically trigger on Day+5 at prevailing market price plus 1% penalty. Current market price is 8.3% above the contracted price."
        reasoning="JSE Rules §18.5: fails uncured by Day+5 trigger mandatory STRATE buy-in plus a 1% penalty applied to the original trade value. At this price differential, total exposure is R5.4M vs R4.8M contracted."
        title="Initiate Buy-In Prevention"
        onAccept={() => {}}
      />

      <DataTable
        columns={SETTLE_FAIL_COLS}
        rows={rows}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />

      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `Fail — ${selected.counterparty}` : 'Settlement Fail'}
        subtitle={selected ? `${selected.instrument} · ${(selected.fail_quantity ?? 0).toLocaleString()} MWh` : undefined}
        entityRef={selected ? (selected.ref ?? selected.id.slice(-8).toUpperCase()) : undefined}
        status={selected?.chain_status}
        statusVariant={selected ? stateVariant(selected.chain_status) : 'default'}
        fields={selected ? settleFailDrawerFields(selected) : []}
        actions={selected ? settleFailDrawerActions(selected, () => { void fetch(); setDrawerOpen(false); }) : []}
        onActionComplete={fetch}
      />
    </div>
  );
}

// ─── Sub-screen: JIBAR Benchmark Transition (W90) ─────────────────────────────

type BenchmarkRow = {
  id: string;
  ref: string;
  counterparty: string;
  instrument_type: string;
  notional_zar: number;
  days_to_cessation: number | null;
  chain_status: string;
  tier: string;
};

const BENCHMARK_COLS: Column<BenchmarkRow>[] = [
  { key: 'ref',               header: 'Ref',              mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{row.ref ?? row.id.slice(-8).toUpperCase()}</span> },
  { key: 'counterparty',      header: 'Counterparty',     render: row => <span style={{ fontSize: '13px' }}>{row.counterparty}</span> },
  { key: 'instrument_type',   header: 'Instrument Type',  render: row => <span style={{ fontSize: '13px' }}>{row.instrument_type}</span> },
  { key: 'notional_zar',      header: 'Notional',         align: 'right', mono: true,
    render: row => {
      const v = row.notional_zar ?? 0;
      return <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>
        {v >= 1e6 ? `R${(v / 1e6).toFixed(1)}m` : `R${v.toLocaleString()}`}
      </span>;
    } },
  { key: 'days_to_cessation', header: 'Days to Cessation', align: 'right', mono: true,
    render: row => {
      const d = row.days_to_cessation;
      if (d == null) return <span style={{ color: 'var(--oe-text-3)' }}>—</span>;
      return <span style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: d < 30 ? 'var(--oe-rose)' : d < 90 ? 'var(--oe-amber)' : 'var(--oe-text-1)' }}>{d}d</span>;
    } },
  { key: 'chain_status',      header: 'Status',
    render: row => <StatusPill label={row.chain_status} variant={stateVariant(row.chain_status)} /> },
];

function benchmarkDrawerFields(row: BenchmarkRow): DrawerField[] {
  const v = row.notional_zar ?? 0;
  return [
    { label: 'Ref',                  value: row.ref ?? row.id,                             mono: true, span: true },
    { label: 'Counterparty',         value: row.counterparty },
    { label: 'Instrument Type',      value: row.instrument_type },
    { label: 'Notional',             value: v >= 1e6 ? `R${(v / 1e6).toFixed(2)}m` : `R${v.toLocaleString()}`, mono: true },
    { label: 'Days to Cessation',    value: row.days_to_cessation != null ? `${row.days_to_cessation}d` : '—', mono: true },
    { label: 'Status',               value: <StatusPill label={row.chain_status} variant={stateVariant(row.chain_status)} />, span: true },
    { label: 'Tier',                 value: row.tier ?? '—',                               mono: true },
  ];
}

function benchmarkDrawerActions(row: BenchmarkRow, onDone: () => void): DrawerAction[] {
  const actions: DrawerAction[] = [];
  const s = row.chain_status ?? '';

  const transition = async (action: string, extra?: Record<string, unknown>) => {
    await api.post(`/api/benchmark-transition/chain/${row.id}/transition`, { action, ...extra });
    onDone();
  };

  if (s === 'open' || s === 'identified') {
    actions.push({
      id: 'impact-assess',
      label: 'Impact Assessment',
      icon: 'scales',
      variant: 'primary',
      form: (
        <TransitionForm
          actionLabel="Submit Assessment"
          requireReason={false}
          fields={[
            { key: 'fallback_rate', label: 'Proposed Fallback Rate', type: 'select', required: true, options: [
              { value: 'zaronia',    label: 'ZARONIA (SA Overnight)' },
              { value: 'prime_csrc', label: 'Prime + Credit Spread' },
              { value: 'repo',       label: 'SARB Repo Rate' },
            ]},
            { key: 'exposure_zar', label: 'Estimated Exposure (ZAR)', type: 'number', required: false, placeholder: '0' },
          ]}
          onSubmit={async (formData) => { await transition('impact_assess', formData); }}
        />
      ),
      onClick: async () => { /* form handles submission */ },
    });
  }

  if (s === 'assessed') {
    actions.push({
      id: 'classify',
      label: 'Classify Contract',
      icon: 'list',
      variant: 'primary',
      form: (
        <TransitionForm
          actionLabel="Classify"
          requireReason={false}
          fields={[
            { key: 'classification', label: 'Classification', type: 'select', required: true, options: [
              { value: 'active_transition',  label: 'Active — amendment required' },
              { value: 'passive_fallback',   label: 'Passive — contractual fallback' },
              { value: 'legacy_exempt',      label: 'Legacy exempt' },
            ]},
          ]}
          onSubmit={async (formData) => { await transition('classify', formData); }}
        />
      ),
      onClick: async () => { /* form handles submission */ },
    });
  }

  if (s === 'classified') {
    actions.push({
      id: 'notify',
      label: 'Notify Counterparty',
      icon: 'send',
      variant: 'secondary',
      onClick: async () => { await transition('notify'); },
    });
  }

  if (s === 'notified' || s === 'in_negotiation') {
    actions.push({
      id: 'execute-amendment',
      label: 'Execute Amendment',
      icon: 'check-circle',
      variant: 'primary',
      form: (
        <TransitionForm
          actionLabel="Confirm Amendment Execution"
          requireReason={false}
          fields={[
            { key: 'amendment_ref',  label: 'Amendment Reference', type: 'text', required: true, placeholder: 'AMD-...' },
            { key: 'effective_date', label: 'Effective Date',       type: 'date', required: true },
          ]}
          onSubmit={async (formData) => { await transition('execute_amendment', formData); }}
        />
      ),
      onClick: async () => { /* form handles submission */ },
    });
  }

  if (s === 'amended') {
    actions.push({
      id: 'complete-transition',
      label: 'Complete Transition',
      icon: 'approve',
      variant: 'primary',
      onClick: async () => { await transition('complete_transition'); },
    });
  }

  if (s !== 'terminated' && s !== 'completed') {
    actions.push({
      id: 'terminate-legacy',
      label: 'Terminate Legacy Contract',
      icon: 'flag',
      variant: 'danger',
      form: (
        <TransitionForm
          actionLabel="Confirm Termination"
          requireReason={true}
          reasonCodes={[
            { value: 'cessation_date',  label: 'Benchmark cessation date reached' },
            { value: 'mutual_agree',    label: 'Mutually agreed early termination' },
            { value: 'regulatory_dir',  label: 'Regulatory direction' },
          ]}
          onSubmit={async (formData) => { await transition('terminate_legacy', formData); }}
        />
      ),
      onClick: async () => { /* form handles submission */ },
    });
  }

  actions.push({
    id: 'view-chain',
    label: 'View Audit Chain',
    icon: 'list',
    variant: 'secondary',
    onClick: async () => {
      await api.get(`/api/benchmark-transition/chain/${row.id}`);
      onDone();
    },
  });

  return actions;
}

function BenchmarkTransitionScreen() {
  const [rows, setRows] = React.useState<BenchmarkRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<BenchmarkRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const fetch = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/benchmark-transition/chain');
      setRows((res.data?.data ?? res.data?.results ?? res.data ?? []) as BenchmarkRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetch(); }, [fetch]);

  const urgentCount    = rows.filter(r => (r.days_to_cessation ?? 999) < 30).length;
  const pendingCount   = rows.filter(r => r.chain_status !== 'completed' && r.chain_status !== 'terminated').length;
  const totalNotional  = rows.reduce((s, r) => s + (r.notional_zar ?? 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          JIBAR Benchmark Transition
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' contracts'}</div>
      </div>

      {urgentCount > 0 && (
        <div style={{ background: 'var(--oe-rose-bg)', border: '1px solid var(--oe-rose)', borderRadius: 'var(--oe-r-card)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <OeIcon name="alert-triangle" size={14} color="var(--oe-rose)" />
          <span style={{ fontSize: '13px', color: 'var(--oe-rose)', fontWeight: 500 }}>
            {urgentCount} contract{urgentCount > 1 ? 's' : ''} within 30 days of JIBAR cessation — amendment required immediately.
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {[
          { label: 'Pending Transition', value: String(pendingCount),  positive: pendingCount === 0 },
          { label: '< 30 Days Urgent',   value: String(urgentCount),   positive: urgentCount === 0 },
          { label: 'Total Notional',     value: totalNotional >= 1e6 ? `R${(totalNotional / 1e6).toFixed(0)}m` : `R${totalNotional.toLocaleString()}`, positive: true },
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{item.label}</div>
            <div style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'var(--oe-font-mono)', color: item.positive ? 'var(--oe-green)' : 'var(--oe-rose)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '12px 16px', fontSize: '12px', color: 'var(--oe-text-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <OeIcon name="checklist" size={14} />
        W90 — JIBAR to ZARONIA/SOFR benchmark transition. FSCA / SARB directive. Contracts referencing JIBAR must be amended or terminated prior to cessation date. Terminate-legacy crosses regulator every tier.
      </div>

      <AIInsightCard
        suggestion="JSAFIX benchmark rate for 5-year ZAR swaps moved 47bps this week — the largest single-week move in 2026. 3 existing OTC positions have embedded benchmark references that are scheduled for JSAFIX discontinuation in Dec 2026. Fallback to ZARONIA is not yet documented."
        reasoning="FMA 2012 §35A: counterparties to benchmark-referencing contracts must document fallback provisions before benchmark discontinuation. Failure to document by 90 days prior triggers mandatory novation via JSE."
        title="Document Fallback Provisions"
        onAccept={() => {}}
      />

      <DataTable
        columns={BENCHMARK_COLS}
        rows={rows}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />

      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `Transition — ${selected.counterparty}` : 'Benchmark Transition'}
        subtitle={selected ? `${selected.instrument_type} · ${selected.notional_zar >= 1e6 ? `R${(selected.notional_zar / 1e6).toFixed(1)}m` : `R${(selected.notional_zar ?? 0).toLocaleString()}`}` : undefined}
        entityRef={selected ? (selected.ref ?? selected.id.slice(-8).toUpperCase()) : undefined}
        status={selected?.chain_status}
        statusVariant={selected ? stateVariant(selected.chain_status) : 'default'}
        fields={selected ? benchmarkDrawerFields(selected) : []}
        actions={selected ? benchmarkDrawerActions(selected, () => { void fetch(); setDrawerOpen(false); }) : []}
        onActionComplete={fetch}
      />
    </div>
  );
}

// ─── Sub-screen: Pre-Trade Credit Check & Settlement-Risk Exposure (W107) ────

type PreTradeRow = {
  id: string;
  ref: string;
  counterparty_name: string;
  proposed_notional_zar: number;
  credit_grade: string;
  utilisation_pct: number;
  chain_status: string;
  checked_at: string | null;
  tier: string;
};

const PRETRADE_COLS: Column<PreTradeRow>[] = [
  { key: 'ref',                   header: 'Ref',              mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{row.ref ?? row.id.slice(-8).toUpperCase()}</span> },
  { key: 'counterparty_name',     header: 'Counterparty',     render: row => <span style={{ fontSize: '13px' }}>{row.counterparty_name}</span> },
  { key: 'credit_grade',          header: 'Credit Grade',
    render: row => {
      const grade = row.credit_grade ?? '';
      const variant = /^AA?$/.test(grade) ? 'green' : grade === 'BBB' ? 'amber' : 'rose';
      return <StatusPill label={grade || '—'} variant={variant} />;
    } },
  { key: 'proposed_notional_zar', header: 'Notional',         align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{`R ${(row.proposed_notional_zar / 1e6).toFixed(1)}M`}</span> },
  { key: 'utilisation_pct',       header: 'Utilisation',      align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', color: row.utilisation_pct > 90 ? 'var(--oe-rose)' : 'var(--oe-text-1)' }}>{row.utilisation_pct.toFixed(1)}%</span> },
  { key: 'chain_status',          header: 'Status',
    render: row => <StatusPill label={row.chain_status} variant={stateVariant(row.chain_status)} /> },
];

function preTradeDrawerFields(row: PreTradeRow): DrawerField[] {
  return [
    { label: 'Ref',                    value: row.ref ?? row.id,                     mono: true, span: true },
    { label: 'Counterparty',           value: row.counterparty_name,                 span: true },
    { label: 'Credit Grade',           value: row.credit_grade ?? '—',               mono: true },
    { label: 'Proposed Notional',      value: `R ${(row.proposed_notional_zar / 1e6).toFixed(1)}M`, mono: true },
    { label: 'Utilisation',            value: `${row.utilisation_pct.toFixed(1)}%`,  mono: true },
    { label: 'Status',                 value: <StatusPill label={row.chain_status} variant={stateVariant(row.chain_status)} />, span: true },
    { label: 'Checked At',             value: row.checked_at ? row.checked_at.slice(0, 19).replace('T', ' ') : '—', mono: true },
    { label: 'Tier',                   value: row.tier ?? '—',                       mono: true },
  ];
}

function preTradeDrawerActions(row: PreTradeRow, onDone: () => void): DrawerAction[] {
  const s = row.chain_status ?? '';
  const actions: DrawerAction[] = [];

  if (s === 'pending' || s === 'open') {
    actions.push({
      id: 'run-check',
      label: 'Run Credit Check',
      icon: 'checklist',
      variant: 'primary',
      onClick: () => api.post(`/api/trader/pretrade-credit/chain/${row.id}/transition`, { action: 'run_check' }).then(() => onDone()),
    });
  }
  if (s === 'checked') {
    actions.push({
      id: 'approve-trade',
      label: 'Approve Trade',
      icon: 'check-circle',
      variant: 'primary',
      onClick: () => api.post(`/api/trader/pretrade-credit/chain/${row.id}/transition`, { action: 'approve_trade' }).then(() => onDone()),
    });
    actions.push({
      id: 'reject-trade',
      label: 'Reject Trade',
      icon: 'flag',
      variant: 'danger',
      onClick: () => api.post(`/api/trader/pretrade-credit/chain/${row.id}/transition`, { action: 'reject_trade' }).then(() => onDone()),
    });
  }
  actions.push({
    id: 'flag-review',
    label: 'Flag for Review',
    icon: 'shield',
    variant: 'secondary',
    onClick: () => api.post(`/api/trader/pretrade-credit/chain/${row.id}/transition`, { action: 'flag_for_review' }).then(() => onDone()),
  });

  return actions;
}

function PreTradeScreen() {
  const [rows, setRows] = React.useState<PreTradeRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<PreTradeRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const fetch = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/trader/pretrade-credit/chain');
      setRows((res.data?.data ?? res.data?.results ?? res.data ?? []) as PreTradeRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetch(); }, [fetch]);

  const highUtilCount = rows.filter(r => r.utilisation_pct > 90).length;
  const pendingCount  = rows.filter(r => r.chain_status === 'pending' || r.chain_status === 'open').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Pre-Trade Credit Check &amp; Settlement-Risk Exposure
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' checks'}</div>
      </div>

      {highUtilCount > 0 && (
        <div style={{ background: 'var(--oe-rose-bg)', border: '1px solid var(--oe-rose)', borderRadius: 'var(--oe-r-card)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <OeIcon name="lock" size={14} color="var(--oe-rose)" />
          <span style={{ fontSize: '13px', color: 'var(--oe-rose)', fontWeight: 500 }}>
            {highUtilCount} counterpart{highUtilCount > 1 ? 'ies' : 'y'} at &gt;90% credit utilisation — approve with caution.
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {[
          { label: 'Pending Checks',      value: String(pendingCount),    positive: pendingCount === 0 },
          { label: '>90% Utilisation',     value: String(highUtilCount),   positive: highUtilCount === 0 },
          { label: 'Total Checks',         value: String(rows.length),     positive: true },
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{item.label}</div>
            <div style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'var(--oe-font-mono)', color: item.positive ? 'var(--oe-green)' : 'var(--oe-rose)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '12px 16px', fontSize: '12px', color: 'var(--oe-text-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <OeIcon name="lock" size={14} />
        W107 — Pre-trade credit check and settlement-risk exposure gate. Grades A/AA approved; BBB requires review; BB and below auto-reject pending override. Utilisation &gt;90% triggers flag-for-review.
      </div>

      <AIInsightCard
        suggestion="3 counterparties showing utilisation >85%. Alpha Solar and Meridian Energy approach credit limits — consider pre-clearing netting opportunities before end of trading day."
        reasoning="Credit limit breaches trigger forced rejection at 100% utilisation, creating order-book gaps at inopportune moments."
        title="Review Exposures"
        onAccept={() => {}}
      />

      <DataTable<PreTradeRow>
        columns={PRETRADE_COLS}
        rows={rows}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />

      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `Pre-Trade — ${selected.counterparty_name}` : 'Pre-Trade Credit Check'}
        subtitle={selected ? `Grade: ${selected.credit_grade ?? '—'} · ${(selected.proposed_notional_zar / 1e6).toFixed(1)}M` : undefined}
        entityRef={selected ? (selected.ref ?? selected.id.slice(-8).toUpperCase()) : undefined}
        status={selected?.chain_status}
        statusVariant={selected ? stateVariant(selected.chain_status) : 'default'}
        fields={selected ? preTradeDrawerFields(selected) : []}
        actions={selected ? preTradeDrawerActions(selected, () => { void fetch(); setDrawerOpen(false); }) : []}
        onActionComplete={fetch}
      />
    </div>
  );
}

// ─── Sub-screen: Daily P&L Attribution & Risk-Adjusted Returns (W111) ─────────

type PnlAttrRow = {
  id: string;
  ref: string;
  trading_date: string;
  desk: string;
  gross_pnl_zar: number;
  risk_charge_zar: number;
  net_pnl_zar: number;
  sharpe_ratio: number | null;
  chain_status: string;
  tier: string;
};

const PNL_ATTR_COLS: Column<PnlAttrRow>[] = [
  { key: 'ref',            header: 'Ref',          mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{row.ref ?? row.id.slice(-8).toUpperCase()}</span> },
  { key: 'trading_date',   header: 'Date',         mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{row.trading_date ? row.trading_date.slice(0, 10) : '—'}</span> },
  { key: 'desk',           header: 'Desk',         render: row => <span style={{ fontSize: '13px' }}>{row.desk}</span> },
  { key: 'gross_pnl_zar',  header: 'Gross P&L',    align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', color: row.gross_pnl_zar >= 0 ? 'var(--oe-green)' : 'var(--oe-rose)' }}>{`R ${(row.gross_pnl_zar / 1e6).toFixed(2)}M`}</span> },
  { key: 'risk_charge_zar',header: 'Risk Charge',  align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--oe-text-2)' }}>{`R ${(row.risk_charge_zar / 1e6).toFixed(2)}M`}</span> },
  { key: 'net_pnl_zar',    header: 'Net P&L',      align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: row.net_pnl_zar >= 0 ? 'var(--oe-green)' : 'var(--oe-rose)' }}>{`R ${(row.net_pnl_zar / 1e6).toFixed(2)}M`}</span> },
  { key: 'chain_status',   header: 'Status',
    render: row => <StatusPill label={row.chain_status} variant={stateVariant(row.chain_status)} /> },
];

function pnlAttrDrawerFields(row: PnlAttrRow): DrawerField[] {
  return [
    { label: 'Ref',          value: row.ref ?? row.id,                                           mono: true, span: true },
    { label: 'Trading Date', value: row.trading_date ? row.trading_date.slice(0, 10) : '—',      mono: true },
    { label: 'Desk',         value: row.desk },
    { label: 'Gross P&L',    value: `R ${(row.gross_pnl_zar / 1e6).toFixed(2)}M`,               mono: true },
    { label: 'Risk Charge',  value: `R ${(row.risk_charge_zar / 1e6).toFixed(2)}M`,              mono: true },
    { label: 'Net P&L',      value: `R ${(row.net_pnl_zar / 1e6).toFixed(2)}M`,                 mono: true },
    { label: 'Sharpe Ratio', value: row.sharpe_ratio != null ? row.sharpe_ratio.toFixed(2) : '—', mono: true },
    { label: 'Status',       value: <StatusPill label={row.chain_status} variant={stateVariant(row.chain_status)} />, span: true },
    { label: 'Tier',         value: row.tier ?? '—',                                             mono: true },
  ];
}

function pnlAttrDrawerActions(row: PnlAttrRow, onDone: () => void): DrawerAction[] {
  const s = row.chain_status ?? '';
  const actions: DrawerAction[] = [];

  if (s === 'draft' || s === 'pending') {
    actions.push({
      id: 'submit-attribution',
      label: 'Submit Attribution',
      icon: 'send',
      variant: 'primary',
      onClick: () => api.post(`/api/trader/pnl-attribution/chain/${row.id}/transition`, { action: 'submit_attribution' }).then(() => onDone()),
    });
  }
  if (s === 'submitted') {
    actions.push({
      id: 'review',
      label: 'Review',
      icon: 'checklist',
      variant: 'secondary',
      onClick: () => api.post(`/api/trader/pnl-attribution/chain/${row.id}/transition`, { action: 'review' }).then(() => onDone()),
    });
  }
  if (s === 'under_review') {
    actions.push({
      id: 'approve',
      label: 'Approve',
      icon: 'check-circle',
      variant: 'primary',
      onClick: () => api.post(`/api/trader/pnl-attribution/chain/${row.id}/transition`, { action: 'approve' }).then(() => onDone()),
    });
    actions.push({
      id: 'restate',
      label: 'Restate',
      icon: 'flag',
      variant: 'danger',
      onClick: () => api.post(`/api/trader/pnl-attribution/chain/${row.id}/transition`, { action: 'restate' }).then(() => onDone()),
    });
  }

  return actions;
}

function PnlAttributionScreen() {
  const [rows, setRows] = React.useState<PnlAttrRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<PnlAttrRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const fetch = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/trader/pnl-attribution/chain');
      setRows((res.data?.data ?? res.data?.results ?? res.data ?? []) as PnlAttrRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetch(); }, [fetch]);

  const totalNet  = rows.reduce((s, r) => s + r.net_pnl_zar, 0);
  const avgSharpe = rows.length > 0 ? rows.reduce((s, r) => s + (r.sharpe_ratio ?? 0), 0) / rows.length : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Daily P&amp;L Attribution &amp; Risk-Adjusted Returns
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' records'}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {[
          { label: 'Total Net P&L',  value: `R ${(totalNet / 1e6).toFixed(2)}M`,                  positive: totalNet >= 0 },
          { label: 'Avg Sharpe',     value: avgSharpe != null ? avgSharpe.toFixed(2) : '—',        positive: avgSharpe != null && avgSharpe >= 1 },
          { label: 'Records',        value: String(rows.length),                                    positive: true },
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{item.label}</div>
            <div style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'var(--oe-font-mono)', color: item.positive ? 'var(--oe-green)' : 'var(--oe-rose)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '12px 16px', fontSize: '12px', color: 'var(--oe-text-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <OeIcon name="chart-line" size={14} />
        W111 — Daily P&amp;L attribution and risk-adjusted returns. Gross P&amp;L split by desk; risk charge applied per VaR allocation; net Sharpe computed rolling 30-day. Restate crosses risk management every tier.
      </div>

      <AIInsightCard
        suggestion="Tuesday's energy-peak desk contributed R2.4M net P&L but Sharpe ratio is 0.31 — below the 0.5 house threshold. Risk-adjusted returns underperform vs short-term desk."
        reasoning="Desks trading below Sharpe threshold trigger re-examination of position sizing per FSCA best-execution guidelines."
        title="View Risk Decomposition"
        onAccept={() => {}}
      />

      <DataTable<PnlAttrRow>
        columns={PNL_ATTR_COLS}
        rows={rows}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />

      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `P&L — ${selected.desk}` : 'P&L Attribution'}
        subtitle={selected ? `${selected.trading_date ? selected.trading_date.slice(0, 10) : '—'} · Net R ${(selected.net_pnl_zar / 1e6).toFixed(2)}M` : undefined}
        entityRef={selected ? (selected.ref ?? selected.id.slice(-8).toUpperCase()) : undefined}
        status={selected?.chain_status}
        statusVariant={selected ? stateVariant(selected.chain_status) : 'default'}
        fields={selected ? pnlAttrDrawerFields(selected) : []}
        actions={selected ? pnlAttrDrawerActions(selected, () => { void fetch(); setDrawerOpen(false); }) : []}
        onActionComplete={fetch}
      />
    </div>
  );
}

// ─── Type for all screens ─────────────────────────────────────────────────────

type ActiveScreen = 'desk' | 'orders' | 'positions' | 'book' | 'risk' | 'bex' | 'surveillance' | 'algo' | 'analytics' | 'reporting' | 'allocations' | 'margin' | 'mm' | 'pre-trade' | 'pnl-attribution' | 'settlement-fails' | 'benchmark';

// ─── Component ────────────────────────────────────────────────────────────────

export function TraderWorkstation() {
  const { data: me } = useCurrentUser();
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('desk');

  const navConfig = {
    ...TRADER_NAV,
    activeId: (() => {
      const map: Record<ActiveScreen, string> = {
        desk: 'tr-desk', orders: 'tr-orders', positions: 'tr-positions',
        book: 'tr-orders', risk: 'tr-risk', bex: 'tr-rfq',
        surveillance: 'tr-abuse', algo: 'tr-algo', analytics: 'tr-pnl',
        reporting: 'tr-reporting', allocations: 'tr-alloc', margin: 'tr-margin',
        mm: 'tr-mm', 'pre-trade': 'trader-pre-trade', 'pnl-attribution': 'trader-pnl-attr',
        'settlement-fails': 'tr-settlement-fails', benchmark: 'tr-benchmark',
      };
      return map[activeScreen] ?? 'tr-desk';
    })(),
    sections: TRADER_NAV.sections.map(section => ({
      ...section,
      items: section.items.map(item => ({
        ...item,
        onClick: ((): (() => void) | undefined => {
          const clickMap: Record<string, () => void> = {
            'tr-desk':              () => setActiveScreen('desk'),
            'tr-orders':            () => setActiveScreen('orders'),
            'tr-positions':         () => setActiveScreen('positions'),
            'tr-rfq':               () => setActiveScreen('bex'),
            'tr-abuse':             () => setActiveScreen('surveillance'),
            'tr-reporting':         () => setActiveScreen('reporting'),
            'tr-algo':              () => setActiveScreen('algo'),
            'tr-alloc':             () => setActiveScreen('allocations'),
            'tr-margin':            () => setActiveScreen('margin'),
            'tr-mm':                () => setActiveScreen('mm'),
            'trader-pre-trade':     () => setActiveScreen('pre-trade'),
            'tr-pnl':               () => setActiveScreen('analytics'),
            'tr-risk':              () => setActiveScreen('risk'),
            'trader-pnl-attr':      () => setActiveScreen('pnl-attribution'),
            'tr-settlement-fails':  () => setActiveScreen('settlement-fails'),
            'tr-benchmark':         () => setActiveScreen('benchmark'),
          };
          return clickMap[item.id];
        })(),
      })),
    })),
  };

  const breadcrumbLabel: Record<ActiveScreen, string> = {
    desk: 'Trade Desk', orders: 'Orders', positions: 'Positions',
    book: 'Order Book', risk: 'Risk Dashboard', bex: 'RFQ / Best Execution',
    surveillance: 'Market Abuse', algo: 'Algo Certs', analytics: 'Analytics & Reports',
    reporting: 'Trade Reporting', allocations: 'Allocations', margin: 'Margin',
    mm: 'MM Compliance', 'pre-trade': 'Pre-Trade Credit W107', 'pnl-attribution': 'P&L Attribution W111',
    'settlement-fails': 'Settlement Fails', benchmark: 'Benchmark Transition',
  };

  return (
    <AppShell
      role="trader"
      userName={me?.name ?? 'User'}
      userEmail={me?.email ?? ''}
      navConfig={navConfig}
      breadcrumbs={[{ label: 'Trader' }, { label: breadcrumbLabel[activeScreen] }]}
      alerts={[
        { id: 'a1', message: 'Daily VaR limit 94% utilised — review open positions', variant: 'amber', href: '#risk' },
        { id: 'a2', message: 'STOR alert: pattern detected on ORD-002 — surveillance review required', variant: 'rose', href: '#abuse' },
      ]}
    >
      {activeScreen === 'analytics'         ? <TraderAnalytics />
     : activeScreen === 'orders'            ? <OrdersScreen />
     : activeScreen === 'positions'         ? <PositionsScreen />
     : activeScreen === 'book'              ? <BookScreen />
     : activeScreen === 'risk'              ? <RiskScreen />
     : activeScreen === 'bex'              ? <BexScreen />
     : activeScreen === 'surveillance'      ? <SurveillanceScreen />
     : activeScreen === 'algo'              ? <AlgoScreen />
     : activeScreen === 'reporting'         ? <ReportingScreen />
     : activeScreen === 'allocations'       ? <AllocationsScreen />
     : activeScreen === 'margin'            ? <MarginScreen />
     : activeScreen === 'mm'               ? <MmComplianceScreen />
     : activeScreen === 'pre-trade'         ? <PreTradeScreen />
     : activeScreen === 'pnl-attribution'   ? <PnlAttributionScreen />
     : activeScreen === 'settlement-fails'  ? <SettlementFailsScreen />
     : activeScreen === 'benchmark'         ? <BenchmarkTransitionScreen />
     : <TradeDeskDashboard />}
    </AppShell>
  );
}

function TradeDeskDashboard() {
  const { data: orders, loading: ordersLoading, refetch } = useTraderOrders({ status: 'open' });
  const { data: positions, loading: posLoading } = useTraderPositions();
  const { data: pnl } = useTraderPnl({ period: 'mtd' });
  const [selected, setSelected] = React.useState<TraderOrder | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const totalBuy = orders.filter(o => o.side === 'buy').reduce((s, o) => s + (o.volume_mwh || 0), 0);
  const totalSell = orders.filter(o => o.side === 'sell').reduce((s, o) => s + (o.volume_mwh || 0), 0);
  const mtdPnl = pnl.reduce((s, p) => s + (p.net_pnl_zar || 0), 0);
  const openOrderCount = orders.length;

  const netPosition = totalBuy - totalSell;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="oe-grad-text" style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
            Trade Desk
          </h1>
          <div style={{ fontSize: '13px', color: 'var(--oe-text-3)', marginTop: '4px' }}>
            Session: {new Date().toISOString().slice(0, 10)} · {ordersLoading ? '…' : `${openOrderCount} orders`} · Net position {ordersLoading ? '…' : `${netPosition >= 0 ? '+' : ''}${netPosition} MWh`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={ghostBtnStyle}><OeIcon name="filter" size={14} />Filter</button>
          <button style={primaryBtnStyle}><OeIcon name="plus" size={14} color="#fff" />New Order</button>
        </div>
      </div>

      {/* KPIs */}
      <StatGrid cols={4}>
        <StatCard
          label="MTD P&L"
          value={ordersLoading ? '…' : `${mtdPnl >= 0 ? '+' : ''}R${Math.abs(mtdPnl).toLocaleString()}`}
          delta={mtdPnl >= 0 ? 'positive' : 'negative'}
          positive={mtdPnl >= 0}
          icon="chart-line"
          variant="green"
        />
        <StatCard
          label="Open Orders"
          value={ordersLoading ? '…' : String(openOrderCount)}
          delta={`${totalBuy} MWh buy · ${totalSell} MWh sell`}
          icon="lightning"
          variant="navy"
        />
        <StatCard
          label="Net Position"
          value={ordersLoading ? '…' : `${netPosition >= 0 ? '+' : ''}${netPosition}`}
          unit="MWh"
          delta={ordersLoading ? '…' : `${openOrderCount} open orders`}
          icon="lightning"
          variant="navy"
        />
        <StatCard
          label="Open Positions"
          value={posLoading ? '…' : String(positions.length)}
          unit="books"
          delta={posLoading ? '…' : `${positions.filter(p => p.net_mwh !== 0).length} with net exposure`}
          icon="bar-chart"
          variant="blue"
        />
      </StatGrid>

      {/* Two-column */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Order blotter */}
          <section>
            <SectionHeader title="Order Blotter" action={{ label: 'Full history', href: '#orders' }} />
            <DataTable
              columns={ORDER_COLS}
              rows={orders}
              loading={ordersLoading}
              compact
              onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
            />
          </section>

          {/* P&L attribution bar */}
          <section>
            <SectionHeader title="P&L Attribution" action={{ label: 'Full analytics', href: '#pnl' }} />
            <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '16px', boxShadow: 'var(--oe-shadow-card)' }}>
              <PnlBar pnl={pnl} />
            </div>
          </section>

          {/* Position summary */}
          <section>
            <SectionHeader title="Open Positions" action={{ label: 'Manage limits', href: '#positions' }} />
            <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', overflow: 'hidden', boxShadow: 'var(--oe-shadow-card)' }}>
              <PositionSummary positions={positions} loading={posLoading} />
            </div>
          </section>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <AIInsightCard
            title="Trading Alert"
            suggestion="VaR 94% utilised with 3 hours of peak trading remaining. Historical peak-hour volatility for SOLAR-DAH is +18% — consider reducing exposure by 50 MWh to maintain headroom."
            reasoning="GARCH(1,1) volatility model calibrated on 90-day SA energy market data. Stress test: afternoon cloud event (P95 scenario) would push realised VaR to R527k, exceeding limit."
            confidence="high"
            onAccept={() => apexClient.trader.listOrders({ status: 'open' }).then(refetch)}
          />

          <ActionPanel
            title="Trading Actions"
            actions={[
              {
                id: 'new-order',
                label: 'Place Order',
                description: 'DAH, intraday or bilateral',
                icon: 'send',
                variant: 'primary',
                form: (
                  <TransitionForm
                    actionLabel="Place Order"
                    requireReason={false}
                    fields={[
                      { key: 'instrument', label: 'Instrument', type: 'select', required: true, options: [
                        { value: 'SOLAR-DAH', label: 'SOLAR-DAH-2026-06' },
                        { value: 'WIND-DAH',  label: 'WIND-DAH-2026-06' },
                        { value: 'PEAK-DAH',  label: 'PEAK-DAH-2026-06' },
                        { value: 'BASE-DAH',  label: 'BASE-DAH-2026-06' },
                      ]},
                      { key: 'side', label: 'Side', type: 'select', required: true, options: [
                        { value: 'buy', label: 'Buy' },
                        { value: 'sell', label: 'Sell' },
                      ]},
                      { key: 'quantity', label: 'Quantity (MWh)', type: 'number', required: true, placeholder: '0' },
                      { key: 'price', label: 'Limit Price (R/MWh)', type: 'number', required: true, placeholder: '0.00' },
                    ]}
                    onSubmit={async data => { await apexClient.trader.placeOrder(data); refetch(); }}
                  />
                ),
              },
              {
                id: 'cancel-order',
                label: 'Cancel Order',
                description: 'Cancel the top open order',
                icon: 'flag',
                variant: 'secondary',
                form: (
                  <TransitionForm
                    actionLabel="Cancel Order"
                    requireReason={false}
                    fields={[]}
                    onSubmit={async _data => { if (orders[0]) { await apexClient.trader.cancelOrder(orders[0].id); refetch(); } }}
                  />
                ),
              },
              {
                id: 'rfq',
                label: 'Request for Quote',
                description: 'Best-execution bilateral quote',
                icon: 'scales',
                variant: 'secondary',
                onClick: async () => { await apexClient.trader.listOrders({ limit: 50 }); refetch(); },
              },
              {
                id: 'report-stor',
                label: 'File STOR Report',
                description: 'FSCA suspicious transaction',
                icon: 'flag',
                variant: 'danger',
                onClick: async () => { await apexClient.audit.listBlocks({ entity_type: 'market_abuse_case' }); refetch(); },
              },
            ]}
          />
        </div>
      </div>

      {/* Order detail drawer from blotter */}
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `${selected.side === 'buy' ? 'Buy' : 'Sell'} ${selected.energy_type}` : ''}
        subtitle={selected ? `${selected.volume_mwh} MWh · ${selected.instruction}` : undefined}
        entityRef={selected?.id ?? undefined}
        status={selected?.status}
        statusVariant={selected ? stateVariant(selected.status) : 'default'}
        fields={selected ? buildOrderDrawerFields(selected) : []}
        actions={selected ? buildOrderDrawerActions(selected, refetch) : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

// ─── P&L bar component ────────────────────────────────────────────────────────

interface TraderPnlEntry {
  net_pnl_zar: number;
  month?: string;
}

function PnlBar({ pnl }: { pnl: TraderPnlEntry[] }) {
  const items = pnl.length > 0
    ? pnl.map(p => ({
        label: p.month ?? '—',
        pnl: p.net_pnl_zar,
        color: p.net_pnl_zar >= 0 ? 'var(--oe-green)' : 'var(--oe-rose)',
      }))
    : [
        { label: 'SOLAR-DAH', pnl: 32400, color: 'var(--oe-green)' },
        { label: 'WIND-DAH',  pnl: -8200, color: 'var(--oe-rose)' },
        { label: 'PEAK-DAH',  pnl: 24000, color: 'var(--oe-green)' },
        { label: 'BASE-DAH',  pnl: 0,     color: 'var(--oe-text-4)' },
      ];

  const max = Math.max(...items.map(i => Math.abs(i.pnl))) || 1;
  const total = items.reduce((s, i) => s + i.pnl, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {items.map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '80px', fontSize: '11px', color: 'var(--oe-text-2)', fontWeight: 500, flexShrink: 0 }}>
            {item.label}
          </div>
          <div style={{ flex: 1, height: '10px', background: 'var(--oe-surf-2)', borderRadius: '5px', overflow: 'hidden', position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                top: 0, bottom: 0,
                left: item.pnl < 0 ? `${50 - (Math.abs(item.pnl) / max) * 50}%` : '50%',
                width: `${(Math.abs(item.pnl) / max) * 50}%`,
                background: item.color,
                borderRadius: '5px',
                transition: 'width 400ms var(--oe-ease)',
              }}
            />
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: '1px', background: 'var(--oe-border)' }} />
          </div>
          <div
            className="oe-mono"
            style={{ width: '70px', fontSize: '11px', color: item.color, fontWeight: 700, textAlign: 'right', flexShrink: 0 }}
          >
            {item.pnl === 0 ? '—' : `${item.pnl > 0 ? '+' : ''}R${Math.abs(item.pnl).toLocaleString()}`}
          </div>
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--oe-border-2)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--oe-text-2)' }}>Total</span>
        <span className="oe-mono" style={{ fontSize: '13px', fontWeight: 800, color: total >= 0 ? 'var(--oe-green)' : 'var(--oe-rose)' }}>
          {`${total >= 0 ? '+' : ''}R${Math.abs(total).toLocaleString()}`}
        </span>
      </div>
    </div>
  );
}

interface TraderPositionEntry {
  energy_type: string;
  net_mwh: number;
  unrealised_pnl: number;
  limit_mw: number;
  utilisation_pct: number;
}

function PositionSummary({ positions, loading }: { positions: TraderPositionEntry[]; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ padding: '16px', color: 'var(--oe-text-3)', fontSize: '13px' }}>Loading positions…</div>
    );
  }

  const rows = positions.length > 0 ? positions : [
    { energy_type: 'SOLAR-DAH',  net_mwh: 350,  unrealised_pnl: 434000,  limit_mw: 500, utilisation_pct: 70 },
    { energy_type: 'WIND-DAH',   net_mwh: -150, unrealised_pnl: -177000, limit_mw: 300, utilisation_pct: 50 },
    { energy_type: 'PEAK-DAH',   net_mwh: 0,    unrealised_pnl: 0,        limit_mw: 200, utilisation_pct: 0 },
    { energy_type: 'BASE-DAH',   net_mwh: 0,    unrealised_pnl: 0,        limit_mw: 400, utilisation_pct: 0 },
  ];

  return (
    <div>
      {rows.map((pos, i) => (
        <div
          key={pos.energy_type}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 14px',
            borderBottom: i < rows.length - 1 ? '1px solid var(--oe-border-2)' : 'none',
          }}
        >
          <div style={{ width: '90px', fontSize: '12px', fontWeight: 600, color: 'var(--oe-text-1)' }}>{pos.energy_type}</div>
          <div className="oe-mono" style={{ width: '80px', fontSize: '12px', fontWeight: 700, color: pos.net_mwh < 0 ? 'var(--oe-rose)' : pos.net_mwh === 0 ? 'var(--oe-text-3)' : 'var(--oe-green)' }}>
            {pos.net_mwh >= 0 ? '+' : ''}{pos.net_mwh} MWh
          </div>
          <div style={{ flex: 1, height: '6px', background: 'var(--oe-surf-2)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${pos.utilisation_pct}%`,
              background: pos.utilisation_pct > 80 ? 'var(--oe-rose)' : pos.utilisation_pct > 60 ? 'var(--oe-amber)' : 'var(--oe-green)',
              borderRadius: '3px',
              transition: 'width 400ms var(--oe-ease)',
            }} />
          </div>
          <div className="oe-mono" style={{ width: '30px', fontSize: '10px', color: 'var(--oe-text-3)', textAlign: 'right' }}>
            {pos.utilisation_pct}%
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SectionHeader({ title, action }: { title: string; action?: { label: string; href: string } }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
      <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0 }}>{title}</h2>
      {action && <a href={action.href} style={{ fontSize: '12px', color: 'var(--oe-blue)', textDecoration: 'none', fontWeight: 500 }}>{action.label} →</a>}
    </div>
  );
}

const ghostBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px',
  border: '1px solid var(--oe-border)', background: 'var(--oe-surf)',
  borderRadius: 'var(--oe-r-btn)', padding: '7px 14px',
  fontSize: '13px', color: 'var(--oe-text-1)', cursor: 'pointer', fontFamily: 'inherit',
};

const primaryBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px',
  border: 'none', background: 'var(--oe-grad-button)',
  borderRadius: 'var(--oe-r-btn)', padding: '7px 14px',
  fontSize: '13px', fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: 'var(--oe-shadow-btn)',
};

export default TraderWorkstation;
