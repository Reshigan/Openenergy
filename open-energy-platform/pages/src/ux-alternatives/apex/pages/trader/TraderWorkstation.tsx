/**
 * Trader Workstation — Apex design
 *
 * Screens:
 * 1. Trade Desk      — live order book summary, P&L, VaR
 * 2. Orders          — order list with pre-trade guard status
 * 3. Positions       — position limit chain (W29)
 * 4. Market Abuse    — surveillance (W52)
 * 5. RFQ/Best Exec   — best execution (W36)
 * 6. Trade Reporting — OTC reporting (W44)
 * 7. Algo Certs      — algo cert + kill-switch (W60)
 * 8. Allocations     — trade allocation chain (W76)
 * 9. Analytics       — P&L attribution, VaR timeseries, VWAP
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
import { useTraderOrders, useTraderPositions, useTraderPnl, useAuditBlocks } from '../../lib/hooks';
import { TraderOrder, TraderPosition, TraderPnl, AuditBlock, apexClient } from '../../lib/client';

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
        { id: 'tr-abuse',      label: 'Market Abuse',   href: '#abuse',     icon: 'shield',    badge: 1, badgeVariant: 'rose' },
        { id: 'tr-reporting',  label: 'Trade Reporting',href: '#reporting', icon: 'report' },
        { id: 'tr-algo',       label: 'Algo Certs',     href: '#algo',      icon: 'gear' },
        { id: 'tr-alloc',      label: 'Allocations',    href: '#alloc',     icon: 'hierarchy' },
        { id: 'tr-margin',     label: 'Margin',         href: '#margin',    icon: 'scales',    badge: 1, badgeVariant: 'amber' },
      ],
    },
    {
      id: 'analytics',
      label: 'Analytics',
      items: [
        { id: 'tr-pnl',        label: 'P&L Analytics',  href: '#pnl',      icon: 'chart-line' },
        { id: 'tr-risk',       label: 'Risk Dashboard', href: '#risk',     icon: 'alert-triangle' },
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

// ─── Type for all screens ─────────────────────────────────────────────────────

type ActiveScreen = 'desk' | 'orders' | 'positions' | 'book' | 'risk' | 'bex' | 'surveillance' | 'algo' | 'analytics' | 'reporting' | 'allocations' | 'margin';

// ─── Component ────────────────────────────────────────────────────────────────

export function TraderWorkstation() {
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('desk');

  const navConfig = {
    ...TRADER_NAV,
    activeId: (() => {
      const map: Record<ActiveScreen, string> = {
        desk: 'tr-desk', orders: 'tr-orders', positions: 'tr-positions',
        book: 'tr-orders', risk: 'tr-risk', bex: 'tr-rfq',
        surveillance: 'tr-abuse', algo: 'tr-algo', analytics: 'tr-pnl',
        reporting: 'tr-reporting', allocations: 'tr-alloc', margin: 'tr-margin',
      };
      return map[activeScreen] ?? 'tr-desk';
    })(),
    sections: TRADER_NAV.sections.map(section => ({
      ...section,
      items: section.items.map(item => ({
        ...item,
        onClick: ((): (() => void) | undefined => {
          const clickMap: Record<string, () => void> = {
            'tr-desk':      () => setActiveScreen('desk'),
            'tr-orders':    () => setActiveScreen('orders'),
            'tr-positions': () => setActiveScreen('positions'),
            'tr-rfq':       () => setActiveScreen('bex'),
            'tr-abuse':     () => setActiveScreen('surveillance'),
            'tr-reporting': () => setActiveScreen('reporting'),
            'tr-algo':      () => setActiveScreen('algo'),
            'tr-alloc':     () => setActiveScreen('allocations'),
            'tr-margin':    () => setActiveScreen('margin'),
            'tr-pnl':       () => setActiveScreen('analytics'),
            'tr-risk':      () => setActiveScreen('risk'),
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
  };

  return (
    <AppShell
      role="trader"
      userName="Sipho Dlamini"
      userEmail="trader@openenergy.co.za"
      navConfig={navConfig}
      breadcrumbs={[{ label: 'Trader' }, { label: breadcrumbLabel[activeScreen] }]}
      alerts={[
        { id: 'a1', message: 'Daily VaR limit 94% utilised — review open positions', variant: 'amber', href: '#risk' },
        { id: 'a2', message: 'STOR alert: pattern detected on ORD-002 — surveillance review required', variant: 'rose', href: '#abuse' },
      ]}
    >
      {activeScreen === 'analytics'    ? <TraderAnalytics />
     : activeScreen === 'orders'       ? <OrdersScreen />
     : activeScreen === 'positions'    ? <PositionsScreen />
     : activeScreen === 'book'         ? <BookScreen />
     : activeScreen === 'risk'         ? <RiskScreen />
     : activeScreen === 'bex'          ? <BexScreen />
     : activeScreen === 'surveillance' ? <SurveillanceScreen />
     : activeScreen === 'algo'         ? <AlgoScreen />
     : activeScreen === 'reporting'    ? <ReportingScreen />
     : activeScreen === 'allocations'  ? <AllocationsScreen />
     : activeScreen === 'margin'       ? <MarginScreen />
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
