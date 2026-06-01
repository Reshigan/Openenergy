import React, { useState } from 'react';
import { OfftakerAnalytics } from '../analytics/OfftakerAnalytics';
import { AppShell, NavConfig } from '../../components/shell/AppShell';
import { StatCard, StatGrid } from '../../components/display/StatCard';
import { DataTable, Column } from '../../components/display/DataTable';
import { StatusPill, stateVariant } from '../../components/display/StatusPill';
import { AIInsightCard } from '../../components/display/AIInsightCard';
import { ChainMap, ChainLink } from '../../components/display/ChainMap';
import { StateFlow, StateFlowStep } from '../../components/display/StateFlow';
import { ActionPanel } from '../../components/actions/ActionPanel';
import { TransitionForm } from '../../components/actions/TransitionForm';
import { DetailDrawer, DrawerField, DrawerAction } from '../../components/display/DetailDrawer';
import {
  useOfftakerPpas,
  useOfftakerDeliveries,
  useOfftakerTariffs,
  useAuditBlocks,
} from '../../lib/hooks';
import {
  OfftakerPpa,
  OfftakerDelivery,
  OfftakerTariff,
  AuditBlock,
  apexClient,
} from '../../lib/client';

// ── Nav ────────────────────────────────────────────────────────────────────────

const BASE_NAV_CONFIG: NavConfig = {
  activeId: 'dashboard',
  sections: [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { id: 'dashboard', label: 'Dashboard',  href: '#dashboard', icon: 'home' },
        { id: 'contracts', label: 'Contracts',  href: '#contracts', icon: 'checklist' },
        { id: 'analytics', label: 'Analytics',  href: '#analytics', icon: 'chart-line' },
      ],
    },
    {
      id: 'ppa',
      label: 'PPA Lifecycle',
      items: [
        { id: 'ppa-contract',    label: 'PPA Contract W22',        href: '#ppa-contract',    icon: 'blueprint' },
        { id: 'tariff',          label: 'Tariff Indexation W39',   href: '#tariff',          icon: 'dollar',         badge: 1, badgeVariant: 'amber' },
        { id: 'take-or-pay',     label: 'Take-or-Pay W32',         href: '#take-or-pay',     icon: 'scales' },
        { id: 'curtailment',     label: 'Curtailment Claims W46',  href: '#curtailment',     icon: 'alert-triangle' },
        { id: 'change-in-law',   label: 'Change-in-Law W78',       href: '#change-in-law',   icon: 'flag' },
      ],
    },
    {
      id: 'credit',
      label: 'Credit Support',
      items: [
        { id: 'payment-security', label: 'Payment Security W54', href: '#payment-security', icon: 'shield' },
        { id: 'rec',              label: 'REC Portfolio W70',    href: '#rec',              icon: 'leaf' },
      ],
    },
    {
      id: 'disputes',
      label: 'Disputes',
      items: [
        { id: 'termination', label: 'PPA Termination W62',     href: '#termination', icon: 'x-circle', badge: 1, badgeVariant: 'rose' },
        { id: 'dispute',     label: 'Dispute Resolution',      href: '#dispute',     icon: 'scales' },
        { id: 'revenue',     label: 'Revenue Assurance W79',   href: '#revenue',     icon: 'dollar' },
      ],
    },
    {
      id: 'reports',
      label: 'Reports',
      defaultCollapsed: true,
      items: [
        { id: 'monthly',  label: 'Monthly PPA Statement', href: '#monthly',  icon: 'report' },
        { id: 'tariff-s', label: 'Tariff Schedule',       href: '#tariff-s', icon: 'report' },
        { id: 'rec-cert', label: 'REC Certificate',       href: '#rec-cert', icon: 'certificate' },
        { id: 'settings', label: 'Settings',              href: '#settings', icon: 'gear' },
      ],
    },
  ],
};

// ── Screen type ───────────────────────────────────────────────────────────────

type ActiveScreen =
  | 'dashboard'
  | 'analytics'
  | 'ppas'
  | 'delivery'
  | 'tariff'
  | 'top'
  | 'curtailment'
  | 'security'
  | 'cil'
  | 'recs'
  | 'termination'
  | 'revenue';

// ── PPA columns ───────────────────────────────────────────────────────────────

const ppaColumns: Column<OfftakerPpa>[] = [
  { key: 'id',            header: 'ID',             width: '10%', mono: true },
  { key: 'ppa_ref',       header: 'PPA Ref',        width: '14%', mono: true },
  { key: 'generator_name', header: 'Generator',     width: '24%' },
  { key: 'contracted_mw', header: 'MW',             width: '8%',  mono: true, align: 'right' },
  {
    key: 'tariff_per_kwh',
    header: 'Tariff (R/kWh)',
    width: '13%',
    mono: true,
    align: 'right',
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>
        R{row.tariff_per_kwh?.toFixed(4)}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'State',
    width: '14%',
    render: (row) => (
      <StatusPill label={row.status} variant={stateVariant(row.status)} size="sm" />
    ),
  },
];

// ── PPA screen columns ────────────────────────────────────────────────────────

const ppasScreenCols: Column<OfftakerPpa>[] = [
  { key: 'ppa_ref',        header: 'PPA Ref',         width: '14%', mono: true },
  { key: 'generator_name', header: 'Generator',       width: '22%' },
  { key: 'contracted_mw',  header: 'MW',              width: '8%',  mono: true, align: 'right' },
  {
    key: 'tariff_per_kwh',
    header: 'Tariff (R/kWh)',
    width: '14%',
    mono: true,
    align: 'right',
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>
        R{row.tariff_per_kwh?.toFixed(4)}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: '14%',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} size="sm" />,
  },
];

// ── Delivery screen columns ────────────────────────────────────────────────────

const deliveryScreenCols: Column<OfftakerDelivery>[] = [
  { key: 'month',              header: 'Month',         width: '13%', mono: true },
  { key: 'contracted_gwh',     header: 'Contracted GWh', width: '14%', mono: true, align: 'right' },
  { key: 'delivered_gwh',      header: 'Delivered GWh',  width: '14%', mono: true, align: 'right' },
  { key: 'variance_gwh',       header: 'Variance GWh',   width: '13%', mono: true, align: 'right' },
  {
    key: 'variance_pct',
    header: 'Variance %',
    width: '12%',
    align: 'right',
    render: (row) => (
      <span style={{
        fontFamily: '"JetBrains Mono", monospace',
        color: row.variance_pct < 0 ? 'var(--oe-rose)' : 'var(--oe-green)',
        fontWeight: 600,
      }}>
        {row.variance_pct?.toFixed(1)}%
      </span>
    ),
  },
  {
    key: 'top_liability_zar',
    header: 'ToP Liability',
    width: '14%',
    align: 'right',
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>
        {row.top_liability_zar > 0 ? 'R' + (row.top_liability_zar / 1e6).toFixed(1) + 'M' : '—'}
      </span>
    ),
  },
];

// ── Tariff screen columns ──────────────────────────────────────────────────────

const tariffScreenCols: Column<OfftakerTariff>[] = [
  { key: 'ppa_ref',        header: 'PPA Ref',         width: '13%', mono: true },
  { key: 'base_tariff',    header: 'Base Tariff',     width: '11%', mono: true, align: 'right' },
  { key: 'cpi_year',       header: 'CPI Year',        width: '9%',  mono: true, align: 'right' },
  {
    key: 'escalation_pct',
    header: 'Escalation',
    width: '11%',
    align: 'right',
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>
        {row.escalation_pct?.toFixed(1)}%
      </span>
    ),
  },
  { key: 'new_tariff',     header: 'New Tariff',      width: '11%', mono: true, align: 'right' },
  { key: 'effective_date', header: 'Effective',       width: '12%', mono: true },
  {
    key: 'nersa_approved',
    header: 'NERSA',
    width: '9%',
    render: (row) => (
      <span style={{
        color: row.nersa_approved ? 'var(--oe-green)' : 'var(--oe-rose)',
        fontWeight: 600,
        fontSize: '12px',
      }}>
        {row.nersa_approved ? 'Yes' : 'No'}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: '12%',
    render: (row) => (
      <StatusPill label={row.status} variant={stateVariant(row.status)} size="sm" />
    ),
  },
];

// ── Monthly delivery comparison (static) ─────────────────────────────────────

interface DeliveryRow {
  id: string;
  month: string;
  contracted: string;
  delivered: string;
  variance: string;
  status: 'cure_window' | 'ok' | 'pending';
}

const deliveryRows: DeliveryRow[] = [
  { id: 'd1', month: 'Apr 2026', contracted: '28,800 MWh', delivered: '27,120 MWh', variance: '-5.8%', status: 'cure_window' },
  { id: 'd2', month: 'May 2026', contracted: '29,760 MWh', delivered: '29,200 MWh', variance: '-1.9%', status: 'ok' },
  { id: 'd3', month: 'Jun 2026', contracted: '28,320 MWh', delivered: '—',          variance: '—',     status: 'pending' },
];

function varianceColor(status: DeliveryRow['status']): string {
  if (status === 'cure_window') return 'var(--oe-amber)';
  if (status === 'ok')          return 'var(--oe-green)';
  return 'var(--oe-text-3)';
}

const deliveryColumns: Column<DeliveryRow>[] = [
  { key: 'month',      header: 'Month',      width: '18%' },
  { key: 'contracted', header: 'Contracted', width: '22%', mono: true },
  { key: 'delivered',  header: 'Delivered',  width: '22%', mono: true },
  {
    key: 'variance',
    header: 'Variance',
    width: '14%',
    align: 'right',
    render: (row) => (
      <span
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 600,
          fontSize: '12px',
          color: varianceColor(row.status),
        }}
      >
        {row.variance}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: '16%',
    render: (row) => (
      <StatusPill label={row.status} variant={stateVariant(row.status)} size="sm" />
    ),
  },
];

// ── Audit block columns ───────────────────────────────────────────────────────

const auditCols: Column<AuditBlock>[] = [
  {
    key: 'id',
    header: 'Ref',
    width: '12%',
    mono: true,
    render: (row) => (
      <span style={{ fontFamily: 'var(--oe-font-mono)', fontSize: '11px', color: 'var(--oe-text-2)' }}>
        {row.id.slice(-8)}
      </span>
    ),
  },
  { key: 'action',     header: 'Action',  width: '28%' },
  { key: 'actor_name', header: 'Actor',   width: '24%' },
  {
    key: 'timestamp',
    header: 'Date',
    width: '20%',
    mono: true,
    render: (row) => (
      <span style={{ fontFamily: 'var(--oe-font-mono)', fontSize: '11px' }}>
        {row.timestamp ? new Date(row.timestamp).toLocaleDateString() : '—'}
      </span>
    ),
  },
];

// ── Tariff indexation steps ────────────────────────────────────────────────────

const tariffSteps: StateFlowStep[] = [
  { id: 't1', label: 'Base Tariff Set',        status: 'complete', timestamp: '2025-07-01' },
  { id: 't2', label: 'CPI Notification',       status: 'complete', timestamp: '2026-05-01' },
  { id: 't3', label: 'Review Period',          status: 'current',  sublabel: 'CPI data 6.2% received' },
  { id: 't4', label: 'Counterparty Response',  status: 'pending' },
  { id: 't5', label: 'Effective Date',         status: 'pending' },
];

// ── Chain links ────────────────────────────────────────────────────────────────

const chainLinks: ChainLink[] = [
  { id: 'cl1', label: 'Take-or-Pay Claim',   chainType: 'Take-or-Pay W32',      state: 'open',      role: 'Offtaker',     relationship: 'child' },
  { id: 'cl2', label: 'Curtailment Claim',   chainType: 'Curtailment W46',      state: 'submitted', role: 'IPP Developer', relationship: 'cross-role' },
  { id: 'cl3', label: 'Payment Security LC', chainType: 'Payment Security W54', state: 'active',    role: 'Offtaker',     relationship: 'peer' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionHeading({ title }: { title: string }) {
  return (
    <div
      style={{
        fontSize: '11px',
        fontWeight: 700,
        color: 'var(--oe-text-2)',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        marginBottom: '10px',
      }}
    >
      {title}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const base: React.CSSProperties = {
    background: 'var(--oe-canvas)',
    border: '1px solid var(--oe-border)',
    borderRadius: 'var(--oe-r-card)',
    boxShadow: 'var(--oe-shadow-card)',
    padding: '16px',
  };
  return <div style={{ ...base, ...style }}>{children}</div>;
}

// ── Sub-screen components ─────────────────────────────────────────────────────

function PpasScreen() {
  const { data, loading, refetch } = useOfftakerPpas();
  const [selected, setSelected] = React.useState<OfftakerPpa | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const drawerFields: DrawerField[] = selected
    ? [
        { label: 'PPA Ref',        value: selected.ppa_ref,          mono: true },
        { label: 'Generator',      value: selected.generator_name },
        { label: 'Contracted MW',  value: selected.contracted_mw != null ? String(selected.contracted_mw) : '—', mono: true },
        { label: 'Tariff (R/kWh)', value: selected.tariff_per_kwh != null ? `R${selected.tariff_per_kwh.toFixed(4)}` : '—', mono: true },
        { label: 'Delivered MWh',  value: selected.delivered_mwh != null ? selected.delivered_mwh.toLocaleString() : '—', mono: true },
        { label: 'Shortfall MWh',  value: selected.shortfall_mwh != null ? selected.shortfall_mwh.toLocaleString() : '—', mono: true },
        { label: 'Shortfall %',    value: selected.shortfall_pct != null ? `${selected.shortfall_pct.toFixed(1)}%` : '—', mono: true },
        { label: 'Cure Window',    value: selected.cure_window_days != null ? `${selected.cure_window_days} days` : '—', mono: true },
        {
          label: 'Monthly Invoice',
          value: selected.monthly_invoice_zar != null
            ? `R${(selected.monthly_invoice_zar / 1e6).toFixed(2)}M`
            : '—',
          mono: true,
        },
        { label: 'Status', value: <StatusPill label={selected.status} variant={stateVariant(selected.status)} size="sm" />, span: true },
      ]
    : [];

  const drawerActions: DrawerAction[] = selected
    ? [
        {
          id: 'view-audit',
          label: 'View Audit Trail',
          icon: 'checklist',
          variant: 'secondary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'ppa_contract', entity_id: selected.id });
          },
        },
        {
          id: 'initiate-top',
          label: 'Initiate Take-or-Pay',
          icon: 'scales',
          variant: 'danger',
          disabled: !(selected.shortfall_pct != null && selected.shortfall_pct > 0),
          disabledReason: 'No active shortfall on this PPA',
          onClick: async () => {
            await apexClient.offtaker.listPpas({ status: 'cure_window' });
            refetch();
          },
        },
        {
          id: 'raise-curtailment',
          label: 'Raise Curtailment Claim',
          icon: 'alert-triangle',
          variant: 'primary',
          onClick: async () => {
            await apexClient.offtaker.listDeliveries({ ppa_ref: selected.ppa_ref });
            refetch();
          },
        },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1
          className="oe-grad-text"
          style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}
        >
          PPA Contracts
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : data.length + ' records'}
        </div>
      </div>
      <DataTable<OfftakerPpa>
        columns={ppasScreenCols}
        rows={data}
        loading={loading}
        onRowClick={(row) => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.generator_name ?? ''}
        subtitle="PPA Contract W22"
        entityRef={selected?.ppa_ref}
        status={selected?.status}
        statusVariant={stateVariant(selected?.status ?? '')}
        fields={drawerFields}
        actions={drawerActions}
        onActionComplete={refetch}
      />
    </div>
  );
}

function DeliveryScreen() {
  const { data, loading } = useOfftakerDeliveries();
  // OfftakerDelivery has no id — cast through unknown for display only, no typed drawer
  const [selectedRaw, setSelectedRaw] = React.useState<Record<string, unknown> | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const drawerFields: DrawerField[] = selectedRaw
    ? [
        { label: 'Month',          value: String(selectedRaw.month ?? '—'),             mono: true },
        { label: 'Contracted GWh', value: String(selectedRaw.contracted_gwh ?? '—'),    mono: true },
        { label: 'Delivered GWh',  value: String(selectedRaw.delivered_gwh ?? '—'),     mono: true },
        { label: 'Variance GWh',   value: String(selectedRaw.variance_gwh ?? '—'),      mono: true },
        {
          label: 'Variance %',
          value: selectedRaw.variance_pct != null
            ? `${Number(selectedRaw.variance_pct).toFixed(1)}%`
            : '—',
          mono: true,
        },
        {
          label: 'ToP Liability',
          value: selectedRaw.top_liability_zar != null && Number(selectedRaw.top_liability_zar) > 0
            ? `R${(Number(selectedRaw.top_liability_zar) / 1e6).toFixed(2)}M`
            : '—',
          mono: true,
        },
        {
          label: 'Deemed Energy',
          value: selectedRaw.deemed_energy_zar != null && Number(selectedRaw.deemed_energy_zar) > 0
            ? `R${(Number(selectedRaw.deemed_energy_zar) / 1e6).toFixed(2)}M`
            : '—',
          mono: true,
        },
      ]
    : [];

  const drawerActions: DrawerAction[] = selectedRaw
    ? [
        {
          id: 'refresh-recon',
          label: 'Refresh Reconciliation',
          icon: 'chart-line',
          variant: 'secondary',
          onClick: async () => {
            await apexClient.offtaker.listDeliveries({ month: String(selectedRaw.month) });
          },
        },
        {
          id: 'raise-top',
          label: 'Raise Take-or-Pay Claim',
          icon: 'scales',
          variant: 'danger',
          disabled: !(selectedRaw.top_liability_zar != null && Number(selectedRaw.top_liability_zar) > 0),
          disabledReason: 'No take-or-pay liability for this period',
          onClick: async () => {
            await apexClient.offtaker.listPpas({ status: 'cure_window' });
          },
        },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1
          className="oe-grad-text"
          style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}
        >
          Monthly Delivery Reconciliation
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : data.length + ' records'}
        </div>
      </div>
      <DataTable<OfftakerDelivery>
        columns={deliveryScreenCols}
        rows={data}
        loading={loading}
        onRowClick={(row) => {
          setSelectedRaw(row as unknown as Record<string, unknown>);
          setDrawerOpen(true);
        }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedRaw ? `Delivery — ${String(selectedRaw.month)}` : ''}
        subtitle="Monthly PPA Reconciliation"
        fields={drawerFields}
        actions={drawerActions}
      />
    </div>
  );
}

function TariffScreen() {
  const { data, loading, refetch } = useOfftakerTariffs();
  const [selected, setSelected] = React.useState<OfftakerTariff | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const drawerFields: DrawerField[] = selected
    ? [
        { label: 'PPA Ref',        value: selected.ppa_ref,           mono: true },
        { label: 'Base Tariff',    value: selected.base_tariff != null ? `R${selected.base_tariff.toFixed(4)}` : '—', mono: true },
        { label: 'CPI Year',       value: selected.cpi_year != null ? String(selected.cpi_year) : '—', mono: true },
        { label: 'Escalation %',   value: selected.escalation_pct != null ? `${selected.escalation_pct.toFixed(1)}%` : '—', mono: true },
        { label: 'New Tariff',     value: selected.new_tariff != null ? `R${selected.new_tariff.toFixed(4)}` : '—', mono: true },
        { label: 'Effective Date', value: selected.effective_date,    mono: true },
        {
          label: 'NERSA Approved',
          value: (
            <span style={{
              color: selected.nersa_approved ? 'var(--oe-green)' : 'var(--oe-rose)',
              fontWeight: 700,
              fontSize: '12px',
            }}>
              {selected.nersa_approved ? 'Yes' : 'No'}
            </span>
          ),
        },
        {
          label: 'Delta Value',
          value: selected.delta_value_zar != null
            ? `R${(selected.delta_value_zar / 1e6).toFixed(2)}M`
            : '—',
          mono: true,
        },
        { label: 'Status', value: <StatusPill label={selected.status} variant={stateVariant(selected.status)} size="sm" />, span: true },
      ]
    : [];

  const drawerActions: DrawerAction[] = selected
    ? [
        {
          id: 'view-audit',
          label: 'View Audit Trail',
          icon: 'checklist',
          variant: 'secondary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'tariff_indexation', entity_id: selected.id });
          },
        },
        {
          id: 'accept-tariff',
          label: 'Accept New Tariff',
          icon: 'check-circle',
          variant: 'primary',
          disabled: selected.status === 'approved' || selected.status === 'active',
          disabledReason: 'Tariff already accepted',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'tariff_indexation' });
            refetch();
          },
        },
        {
          id: 'dispute-tariff',
          label: 'Dispute Indexation',
          icon: 'scales',
          variant: 'danger',
          disabled: selected.nersa_approved,
          disabledReason: 'NERSA-approved tariffs cannot be disputed via this workflow',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'tariff_indexation' });
            refetch();
          },
        },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1
          className="oe-grad-text"
          style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}
        >
          Tariff Indexation W39
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : data.length + ' records'}
        </div>
      </div>
      <DataTable<OfftakerTariff>
        columns={tariffScreenCols}
        rows={data}
        loading={loading}
        onRowClick={(row) => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `Tariff — ${selected.ppa_ref}` : ''}
        subtitle="Annual CPI Escalation Review W39"
        entityRef={selected?.id}
        status={selected?.status}
        statusVariant={stateVariant(selected?.status ?? '')}
        fields={drawerFields}
        actions={drawerActions}
        onActionComplete={refetch}
      />
    </div>
  );
}

function TopScreen() {
  const { data, loading, refetch } = useOfftakerPpas();
  const shortfallPpas = data.filter((p) => (p.shortfall_pct ?? 0) > 0);
  const [selected, setSelected] = React.useState<OfftakerPpa | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const topCols: Column<OfftakerPpa>[] = [
    { key: 'ppa_ref',       header: 'PPA Ref',      width: '14%', mono: true },
    { key: 'generator_name', header: 'Generator',   width: '22%' },
    { key: 'contracted_mw', header: 'MW',           width: '8%',  mono: true, align: 'right' },
    {
      key: 'shortfall_pct',
      header: 'Shortfall %',
      width: '12%',
      align: 'right',
      render: (row) => (
        <span style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--oe-rose)', fontWeight: 700 }}>
          {row.shortfall_pct?.toFixed(1)}%
        </span>
      ),
    },
    {
      key: 'shortfall_mwh',
      header: 'Shortfall MWh',
      width: '14%',
      mono: true,
      align: 'right',
    },
    {
      key: 'cure_window_days',
      header: 'Cure Days',
      width: '12%',
      mono: true,
      align: 'right',
    },
    {
      key: 'status',
      header: 'Status',
      width: '14%',
      render: (row) => (
        <StatusPill label={row.status} variant={stateVariant(row.status)} size="sm" />
      ),
    },
  ];

  const drawerFields: DrawerField[] = selected
    ? [
        { label: 'PPA Ref',        value: selected.ppa_ref,          mono: true },
        { label: 'Generator',      value: selected.generator_name },
        { label: 'Contracted MW',  value: selected.contracted_mw != null ? String(selected.contracted_mw) : '—', mono: true },
        { label: 'Shortfall MWh',  value: selected.shortfall_mwh != null ? selected.shortfall_mwh.toLocaleString() : '—', mono: true },
        { label: 'Shortfall %',    value: selected.shortfall_pct != null ? `${selected.shortfall_pct.toFixed(1)}%` : '—', mono: true },
        { label: 'Cure Window',    value: selected.cure_window_days != null ? `${selected.cure_window_days} days` : '—', mono: true },
        {
          label: 'Monthly Invoice',
          value: selected.monthly_invoice_zar != null
            ? `R${(selected.monthly_invoice_zar / 1e6).toFixed(2)}M`
            : '—',
          mono: true,
        },
        { label: 'Status', value: <StatusPill label={selected.status} variant={stateVariant(selected.status)} size="sm" />, span: true },
      ]
    : [];

  const drawerActions: DrawerAction[] = selected
    ? [
        {
          id: 'initiate-top-claim',
          label: 'Initiate Take-or-Pay Claim',
          icon: 'scales',
          variant: 'danger',
          disabled: selected.status === 'settled' || selected.status === 'closed',
          disabledReason: 'PPA is already settled or closed',
          onClick: async () => {
            await apexClient.offtaker.listPpas({ status: 'cure_window' });
            refetch();
          },
        },
        {
          id: 'request-cure',
          label: 'Issue Cure Notice to Seller',
          icon: 'send',
          variant: 'primary',
          disabled: !(selected.cure_window_days != null && selected.cure_window_days > 0),
          disabledReason: 'No active cure window on this PPA',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'ppa_contract', entity_id: selected.id });
            refetch();
          },
        },
        {
          id: 'view-history',
          label: 'View Delivery History',
          icon: 'chart-line',
          variant: 'secondary',
          onClick: async () => {
            await apexClient.offtaker.listDeliveries({ ppa_ref: selected.ppa_ref });
          },
        },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1
          className="oe-grad-text"
          style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}
        >
          Take-or-Pay W32
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : shortfallPpas.length + ' PPAs in shortfall'}
        </div>
      </div>
      <DataTable<OfftakerPpa>
        columns={topCols}
        rows={shortfallPpas}
        loading={loading}
        onRowClick={(row) => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.generator_name ?? ''}
        subtitle="Take-or-Pay Obligation W32"
        entityRef={selected?.ppa_ref}
        status={selected?.status}
        statusVariant={stateVariant(selected?.status ?? '')}
        fields={drawerFields}
        actions={drawerActions}
        onActionComplete={refetch}
      />
    </div>
  );
}

function CurtailmentScreen() {
  const { data, loading } = useOfftakerDeliveries();
  const curtailed = data.filter((d) => d.variance_gwh < 0);
  // OfftakerDelivery has no id — cast via unknown
  const [selectedRaw, setSelectedRaw] = React.useState<Record<string, unknown> | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const curtailCols: Column<OfftakerDelivery>[] = [
    { key: 'month',          header: 'Month',         width: '14%', mono: true },
    { key: 'contracted_gwh', header: 'Contracted GWh', width: '16%', mono: true, align: 'right' },
    { key: 'delivered_gwh',  header: 'Delivered GWh',  width: '16%', mono: true, align: 'right' },
    {
      key: 'variance_gwh',
      header: 'Curtailed GWh',
      width: '14%',
      align: 'right',
      render: (row) => (
        <span style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--oe-rose)', fontWeight: 700 }}>
          {Math.abs(row.variance_gwh).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'deemed_energy_zar',
      header: 'Deemed Energy',
      width: '16%',
      align: 'right',
      render: (row) => (
        <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>
          {row.deemed_energy_zar > 0 ? 'R' + (row.deemed_energy_zar / 1e6).toFixed(1) + 'M' : '—'}
        </span>
      ),
    },
  ];

  const drawerFields: DrawerField[] = selectedRaw
    ? [
        { label: 'Month',          value: String(selectedRaw.month ?? '—'),          mono: true },
        { label: 'Contracted GWh', value: String(selectedRaw.contracted_gwh ?? '—'), mono: true },
        { label: 'Delivered GWh',  value: String(selectedRaw.delivered_gwh ?? '—'),  mono: true },
        {
          label: 'Curtailed GWh',
          value: selectedRaw.variance_gwh != null
            ? Math.abs(Number(selectedRaw.variance_gwh)).toFixed(2)
            : '—',
          mono: true,
        },
        {
          label: 'Deemed Energy Zar',
          value: selectedRaw.deemed_energy_zar != null && Number(selectedRaw.deemed_energy_zar) > 0
            ? `R${(Number(selectedRaw.deemed_energy_zar) / 1e6).toFixed(2)}M`
            : '—',
          mono: true,
        },
        {
          label: 'ToP Liability',
          value: selectedRaw.top_liability_zar != null && Number(selectedRaw.top_liability_zar) > 0
            ? `R${(Number(selectedRaw.top_liability_zar) / 1e6).toFixed(2)}M`
            : '—',
          mono: true,
        },
      ]
    : [];

  const drawerActions: DrawerAction[] = selectedRaw
    ? [
        {
          id: 'raise-curtailment-claim',
          label: 'Raise Curtailment Compensation Claim',
          icon: 'alert-triangle',
          variant: 'danger',
          disabled: !(selectedRaw.deemed_energy_zar != null && Number(selectedRaw.deemed_energy_zar) > 0),
          disabledReason: 'No deemed energy compensation applicable for this period',
          onClick: async () => {
            await apexClient.offtaker.listDeliveries({ month: String(selectedRaw.month) });
          },
        },
        {
          id: 'view-delivery-audit',
          label: 'View Period Audit',
          icon: 'checklist',
          variant: 'secondary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'ppa_annual_recon' });
          },
        },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1
          className="oe-grad-text"
          style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}
        >
          Curtailment Claims W46
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : curtailed.length + ' curtailed periods'}
        </div>
      </div>
      <DataTable<OfftakerDelivery>
        columns={curtailCols}
        rows={curtailed}
        loading={loading}
        onRowClick={(row) => {
          setSelectedRaw(row as unknown as Record<string, unknown>);
          setDrawerOpen(true);
        }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedRaw ? `Curtailment — ${String(selectedRaw.month)}` : ''}
        subtitle="Curtailment Compensation W46"
        fields={drawerFields}
        actions={drawerActions}
      />
    </div>
  );
}

function SecurityScreen() {
  const { data: auditData, loading: auditLoading, refetch } = useAuditBlocks({ entity_type: 'ppa_payment_security' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const drawerFields: DrawerField[] = selected
    ? [
        { label: 'Block Ref',   value: selected.id.slice(-8),     mono: true },
        { label: 'Action',      value: selected.action },
        { label: 'Actor',       value: selected.actor_name ?? selected.actor_id },
        { label: 'Actor Role',  value: selected.actor_role ?? '—' },
        { label: 'Entity Type', value: selected.entity_type },
        { label: 'Entity ID',   value: selected.entity_id.slice(-12), mono: true },
        { label: 'Timestamp',   value: selected.timestamp ? new Date(selected.timestamp).toLocaleString() : '—', mono: true },
        { label: 'Hash',        value: selected.hash.slice(0, 16) + '…', mono: true, span: true },
      ]
    : [];

  const drawerActions: DrawerAction[] = selected
    ? [
        {
          id: 'refresh-blocks',
          label: 'Refresh Audit Chain',
          icon: 'checklist',
          variant: 'secondary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'ppa_payment_security' });
            refetch();
          },
        },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1
          className="oe-grad-text"
          style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}
        >
          PPA Payment Security W54
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {auditLoading ? 'Loading…' : auditData.length + ' audit records'}
        </div>
      </div>
      <div style={{
        background: 'var(--oe-surf)',
        border: '1px solid var(--oe-border)',
        borderRadius: 'var(--oe-r-card)',
        padding: '12px 16px',
        fontSize: '12px',
        color: 'var(--oe-text-2)',
        lineHeight: 1.6,
      }}>
        Payment security instruments (letter of credit, PCG, cash) are tracked via the W54 audit chain.
        Click any record to inspect the full audit block and take follow-up actions.
      </div>
      <ActionPanel
        actions={[
          {
            id: 'initiate-security',
            label: 'Initiate Payment Security Instrument',
            icon: 'shield',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Initiate Payment Security"
                reasonCodes={[
                  { value: 'letter_of_credit', label: 'Letter of Credit (LC)' },
                  { value: 'pcg',              label: 'Parent Company Guarantee (PCG)' },
                  { value: 'cash_deposit',     label: 'Cash Deposit' },
                ]}
                onSubmit={async () => {
                  await apexClient.audit.listBlocks({ entity_type: 'ppa_payment_security' });
                  refetch();
                }}
                confirmMessage="This will initiate a new payment security instrument lifecycle in W54. The counterparty will be notified and the chain will enter the assessment state."
              />
            ),
          },
        ]}
      />
      <DataTable<AuditBlock>
        columns={auditCols}
        rows={auditData}
        loading={auditLoading}
        onRowClick={(row) => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.action ?? ''}
        subtitle="W54 Payment Security Audit Block"
        entityRef={selected?.id.slice(-8)}
        fields={drawerFields}
        actions={drawerActions}
        onActionComplete={refetch}
      />
    </div>
  );
}

function CilScreen() {
  const { data: auditData, loading: auditLoading, refetch } = useAuditBlocks({ entity_type: 'ppa_change_in_law' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const drawerFields: DrawerField[] = selected
    ? [
        { label: 'Block Ref',   value: selected.id.slice(-8),     mono: true },
        { label: 'Action',      value: selected.action },
        { label: 'Actor',       value: selected.actor_name ?? selected.actor_id },
        { label: 'Actor Role',  value: selected.actor_role ?? '—' },
        { label: 'Entity Type', value: selected.entity_type },
        { label: 'Entity ID',   value: selected.entity_id.slice(-12), mono: true },
        { label: 'Timestamp',   value: selected.timestamp ? new Date(selected.timestamp).toLocaleString() : '—', mono: true },
        { label: 'Hash',        value: selected.hash.slice(0, 16) + '…', mono: true, span: true },
      ]
    : [];

  const drawerActions: DrawerAction[] = selected
    ? [
        {
          id: 'view-ppa',
          label: 'View Linked PPA',
          icon: 'blueprint',
          variant: 'secondary',
          onClick: async () => {
            await apexClient.offtaker.listPpas();
          },
        },
        {
          id: 'refresh-cil',
          label: 'Refresh CIL Chain',
          icon: 'checklist',
          variant: 'secondary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'ppa_change_in_law' });
            refetch();
          },
        },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1
          className="oe-grad-text"
          style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}
        >
          Change-in-Law Relief W78
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {auditLoading ? 'Loading…' : auditData.length + ' audit records'}
        </div>
      </div>
      <div style={{
        background: 'var(--oe-surf)',
        border: '1px solid var(--oe-border)',
        borderRadius: 'var(--oe-r-card)',
        padding: '12px 16px',
        fontSize: '12px',
        color: 'var(--oe-text-2)',
        lineHeight: 1.6,
      }}>
        Tax, regulatory or statutory change-in-law relief claims are tracked via the W78 audit chain.
        Each event represents a state transition in the change-in-law lifecycle for an active PPA.
      </div>
      <ActionPanel
        actions={[
          {
            id: 'lodge-cil',
            label: 'Lodge Change-in-Law Event',
            icon: 'flag',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Lodge CIL Event"
                reasonCodes={[
                  { value: 'tax_change',        label: 'Tax legislation change' },
                  { value: 'regulatory_change', label: 'Regulatory / licence condition change' },
                  { value: 'statutory_change',  label: 'Statutory instrument change' },
                  { value: 'discriminatory',    label: 'Discriminatory change affecting only this PPA' },
                ]}
                onSubmit={async () => {
                  await apexClient.audit.listBlocks({ entity_type: 'ppa_change_in_law' });
                  refetch();
                }}
                confirmMessage="This will log a formal change-in-law event against the selected PPA. An eligibility assessment will begin under W78. The counterparty and NERSA will be notified."
              />
            ),
          },
        ]}
      />
      <DataTable<AuditBlock>
        columns={auditCols}
        rows={auditData}
        loading={auditLoading}
        onRowClick={(row) => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.action ?? ''}
        subtitle="W78 Change-in-Law Audit Block"
        entityRef={selected?.id.slice(-8)}
        fields={drawerFields}
        actions={drawerActions}
        onActionComplete={refetch}
      />
    </div>
  );
}

function RecsScreen() {
  const { data: auditData, loading: auditLoading, refetch } = useAuditBlocks({ entity_type: 'rec_lifecycle' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const drawerFields: DrawerField[] = selected
    ? [
        { label: 'Block Ref',   value: selected.id.slice(-8),     mono: true },
        { label: 'Action',      value: selected.action },
        { label: 'Actor',       value: selected.actor_name ?? selected.actor_id },
        { label: 'Actor Role',  value: selected.actor_role ?? '—' },
        { label: 'Entity Type', value: selected.entity_type },
        { label: 'Entity ID',   value: selected.entity_id.slice(-12), mono: true },
        { label: 'Timestamp',   value: selected.timestamp ? new Date(selected.timestamp).toLocaleString() : '—', mono: true },
        { label: 'Hash',        value: selected.hash.slice(0, 16) + '…', mono: true, span: true },
      ]
    : [];

  const drawerActions: DrawerAction[] = selected
    ? [
        {
          id: 'view-rec-detail',
          label: 'View REC Certificate',
          icon: 'leaf',
          variant: 'secondary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'rec_lifecycle', entity_id: selected.entity_id });
          },
        },
        {
          id: 'refresh-rec',
          label: 'Refresh REC Chain',
          icon: 'checklist',
          variant: 'secondary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'rec_lifecycle' });
            refetch();
          },
        },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1
          className="oe-grad-text"
          style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}
        >
          REC Portfolio W70
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {auditLoading ? 'Loading…' : auditData.length + ' audit records'}
        </div>
      </div>
      <div style={{
        background: 'var(--oe-surf)',
        border: '1px solid var(--oe-border)',
        borderRadius: 'var(--oe-r-card)',
        padding: '12px 16px',
        fontSize: '12px',
        color: 'var(--oe-text-2)',
        lineHeight: 1.6,
      }}>
        I-REC / SAREC / EU-GO certificates and Scope-2 retirement status are tracked via the W70 audit chain.
        Each record represents a lifecycle event for a renewable energy certificate held by this offtaker.
      </div>
      <ActionPanel
        actions={[
          {
            id: 'retire-rec',
            label: 'Retire RECs for Scope-2 Claim',
            icon: 'leaf',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Retire RECs"
                reasonCodes={[
                  { value: 'scope2_voluntary',    label: 'Voluntary Scope-2 disclosure' },
                  { value: 'scope2_compliance',   label: 'Compliance obligation (JSE ESG)' },
                  { value: 'customer_reporting',  label: 'Customer / supply-chain reporting' },
                ]}
                onSubmit={async () => {
                  await apexClient.audit.listBlocks({ entity_type: 'rec_lifecycle' });
                  refetch();
                }}
                confirmMessage="This will initiate the REC retirement workflow. Selected certificates will be permanently cancelled and a retirement statement issued for Scope-2 reporting."
              />
            ),
          },
          {
            id: 'request-rec',
            label: 'Request REC Issuance from Generator',
            icon: 'send',
            variant: 'secondary',
            onClick: async () => {
              await apexClient.audit.listBlocks({ entity_type: 'rec_lifecycle' });
              refetch();
            },
          },
        ]}
      />
      <DataTable<AuditBlock>
        columns={auditCols}
        rows={auditData}
        loading={auditLoading}
        onRowClick={(row) => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.action ?? ''}
        subtitle="W70 REC Lifecycle Audit Block"
        entityRef={selected?.id.slice(-8)}
        fields={drawerFields}
        actions={drawerActions}
        onActionComplete={refetch}
      />
    </div>
  );
}

// ─── PPA Termination (W62) ───────────────────────────────────────────────────

function TerminationScreen() {
  const { data: auditData, loading: auditLoading, refetch } = useAuditBlocks({ entity_type: 'ppa_termination' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const drawerFields: DrawerField[] = selected
    ? [
        { label: 'Block Ref',   value: selected.id.slice(-8),     mono: true },
        { label: 'Action',      value: selected.action },
        { label: 'Actor',       value: selected.actor_name ?? selected.actor_id },
        { label: 'Actor Role',  value: selected.actor_role ?? '—' },
        { label: 'Entity Type', value: selected.entity_type },
        { label: 'Entity ID',   value: selected.entity_id.slice(-12), mono: true },
        { label: 'Timestamp',   value: selected.timestamp ? new Date(selected.timestamp).toLocaleString() : '—', mono: true },
        { label: 'Hash',        value: selected.hash.slice(0, 16) + '…', mono: true, span: true },
      ]
    : [];

  const drawerActions: DrawerAction[] = selected
    ? [
        {
          id: 'serve-notice',
          label: 'Serve Termination Notice',
          icon: 'send',
          variant: 'primary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'ppa_termination', entity_id: selected.entity_id });
            refetch();
          },
        },
        {
          id: 'confirm-termination',
          label: 'Confirm Termination',
          icon: 'checklist',
          variant: 'danger',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'ppa_termination' });
            refetch();
          },
        },
        {
          id: 'withdraw',
          label: 'Withdraw Notice',
          icon: 'reject',
          variant: 'secondary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'ppa_termination' });
            refetch();
          },
        },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1
          className="oe-grad-text"
          style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}
        >
          PPA Termination W62
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {auditLoading ? 'Loading…' : auditData.length + ' audit records'}
        </div>
      </div>
      <div style={{
        background: 'var(--oe-surf)',
        border: '1px solid var(--oe-border)',
        borderRadius: 'var(--oe-r-card)',
        padding: '12px 16px',
        fontSize: '12px',
        color: 'var(--oe-text-2)',
        lineHeight: 1.6,
      }}>
        PPA early-termination and buy-out lifecycle (NERSA s34 + IFRS 9/16 ETA). Each record represents a state
        transition — voluntary or involuntary — in the W62 termination chain. Confirm termination crosses the
        regulator for every tier.
      </div>
      <ActionPanel
        actions={[
          {
            id: 'initiate-termination',
            label: 'Initiate Termination Notice',
            icon: 'x-circle',
            variant: 'danger',
            form: (
              <TransitionForm
                actionLabel="Initiate Termination"
                reasonCodes={[
                  { value: 'voluntary',           label: 'Voluntary — mutual agreement' },
                  { value: 'seller_default',       label: 'Seller default (material breach)' },
                  { value: 'offtaker_default',     label: 'Offtaker default' },
                  { value: 'force_majeure',        label: 'Force majeure — extended' },
                  { value: 'change_in_law',        label: 'Change-in-law unresolved' },
                  { value: 'regulatory_revocation', label: 'Regulatory licence revocation' },
                ]}
                onSubmit={async () => {
                  await apexClient.audit.listBlocks({ entity_type: 'ppa_termination' });
                  refetch();
                }}
                confirmMessage="This will formally initiate the W62 PPA termination workflow. A termination notice will be served to the seller and NERSA will be notified. This action cannot be undone without a formal withdrawal."
              />
            ),
          },
        ]}
      />
      <DataTable<AuditBlock>
        columns={auditCols}
        rows={auditData}
        loading={auditLoading}
        onRowClick={(row) => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.action ?? ''}
        subtitle="W62 PPA Termination Audit Block"
        entityRef={selected?.id.slice(-8)}
        fields={drawerFields}
        actions={drawerActions}
        onActionComplete={refetch}
      />
    </div>
  );
}

// ─── Revenue Assurance / Meter Reconciliation (W79) ──────────────────────────

function RevenueScreen() {
  const { data: auditData, loading: auditLoading, refetch } = useAuditBlocks({ entity_type: 'generation_revenue_assurance' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const drawerFields: DrawerField[] = selected
    ? [
        { label: 'Block Ref',   value: selected.id.slice(-8),     mono: true },
        { label: 'Action',      value: selected.action },
        { label: 'Actor',       value: selected.actor_name ?? selected.actor_id },
        { label: 'Actor Role',  value: selected.actor_role ?? '—' },
        { label: 'Entity Type', value: selected.entity_type },
        { label: 'Entity ID',   value: selected.entity_id.slice(-12), mono: true },
        { label: 'Timestamp',   value: selected.timestamp ? new Date(selected.timestamp).toLocaleString() : '—', mono: true },
        { label: 'Hash',        value: selected.hash.slice(0, 16) + '…', mono: true, span: true },
      ]
    : [];

  const drawerActions: DrawerAction[] = selected
    ? [
        {
          id: 'run-reconciliation',
          label: 'Run Reconciliation',
          icon: 'chart-line',
          variant: 'primary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'generation_revenue_assurance', entity_id: selected.entity_id });
            refetch();
          },
        },
        {
          id: 'raise-dispute',
          label: 'Raise Dispute',
          icon: 'scales',
          variant: 'danger',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'generation_revenue_assurance' });
            refetch();
          },
        },
        {
          id: 'mark-recovered',
          label: 'Mark Recovered',
          icon: 'check-circle',
          variant: 'secondary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'generation_revenue_assurance' });
            refetch();
          },
        },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1
          className="oe-grad-text"
          style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}
        >
          Revenue Assurance W79
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {auditLoading ? 'Loading…' : auditData.length + ' audit records'}
        </div>
      </div>
      <div style={{
        background: 'var(--oe-surf)',
        border: '1px solid var(--oe-border)',
        borderRadius: 'var(--oe-r-card)',
        padding: '12px 16px',
        fontSize: '12px',
        color: 'var(--oe-text-2)',
        lineHeight: 1.6,
      }}>
        Generation revenue assurance and meter reconciliation (NERSA metering code + REIPPPP PPA settlement).
        Reconciles expected vs metered vs settled vs invoiced — classifies leakage (meter drift, comms gap,
        settlement error, curtailment shortfall, clipping loss, meter tampering). Raise dispute crosses regulator
        on every tier; classify meter tampering always reportable.
      </div>
      <ActionPanel
        actions={[
          {
            id: 'open-period',
            label: 'Open Reconciliation Period',
            icon: 'calendar',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Open Period"
                reasonCodes={[
                  { value: 'monthly',   label: 'Monthly reconciliation' },
                  { value: 'quarterly', label: 'Quarterly settlement review' },
                  { value: 'annual',    label: 'Annual true-up' },
                ]}
                onSubmit={async () => {
                  await apexClient.audit.listBlocks({ entity_type: 'generation_revenue_assurance' });
                  refetch();
                }}
                confirmMessage="This will open a new W79 revenue assurance period. The system will reconcile metered, settled, and invoiced data against the expected generation profile and classify any variance."
              />
            ),
          },
          {
            id: 'export-recon',
            label: 'Export Reconciliation Report',
            icon: 'export',
            variant: 'ghost',
            onClick: async () => {
              await apexClient.audit.listBlocks({ entity_type: 'generation_revenue_assurance' });
            },
          },
        ]}
      />
      <DataTable<AuditBlock>
        columns={auditCols}
        rows={auditData}
        loading={auditLoading}
        onRowClick={(row) => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.action ?? ''}
        subtitle="W79 Revenue Assurance Audit Block"
        entityRef={selected?.id.slice(-8)}
        fields={drawerFields}
        actions={drawerActions}
        onActionComplete={refetch}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function OfftakerWorkstation() {
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('dashboard');

  const { data: ppas, loading: ppasLoading } = useOfftakerPpas();
  const { data: deliveries } = useOfftakerDeliveries({ period: 'mtd' });
  const { data: tariffs } = useOfftakerTariffs();

  const activePpas = ppas.filter((p) => p.status === 'active' || p.status === 'in_force').length;
  const totalContractedMw = ppas.reduce((s, p) => s + (p.contracted_mw || 0), 0);
  const totalShortfall = deliveries.reduce(
    (s, d) => s + (d.variance_gwh < 0 ? Math.abs(d.variance_gwh) * 1000 : 0),
    0,
  );
  const topTariff = tariffs.length ? tariffs[0].new_tariff : 0;

  const screenToNavId: Record<ActiveScreen, string> = {
    dashboard: 'dashboard',
    analytics: 'analytics',
    ppas: 'ppa-contract',
    delivery: 'contracts',
    tariff: 'tariff',
    top: 'take-or-pay',
    curtailment: 'curtailment',
    security: 'payment-security',
    cil: 'change-in-law',
    recs: 'rec',
    termination: 'termination',
    revenue: 'revenue',
  };

  const liveNavConfig: NavConfig = {
    ...BASE_NAV_CONFIG,
    activeId: screenToNavId[activeScreen],
    sections: BASE_NAV_CONFIG.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({
        ...item,
        onClick:
          item.id === 'analytics'        ? () => setActiveScreen('analytics')
          : item.id === 'dashboard'      ? () => setActiveScreen('dashboard')
          : item.id === 'contracts'      ? () => setActiveScreen('delivery')
          : item.id === 'ppa-contract'   ? () => setActiveScreen('ppas')
          : item.id === 'tariff'         ? () => setActiveScreen('tariff')
          : item.id === 'take-or-pay'    ? () => setActiveScreen('top')
          : item.id === 'curtailment'    ? () => setActiveScreen('curtailment')
          : item.id === 'change-in-law'  ? () => setActiveScreen('cil')
          : item.id === 'payment-security' ? () => setActiveScreen('security')
          : item.id === 'rec'            ? () => setActiveScreen('recs')
          : item.id === 'termination'    ? () => setActiveScreen('termination')
          : item.id === 'revenue'        ? () => setActiveScreen('revenue')
          : undefined,
      })),
    })),
  };

  const screenLabel: Record<ActiveScreen, string> = {
    dashboard: 'Dashboard',
    analytics: 'Analytics & Reports',
    ppas: 'PPA Contracts',
    delivery: 'Delivery Reconciliation',
    tariff: 'Tariff Indexation',
    top: 'Take-or-Pay',
    curtailment: 'Curtailment Claims',
    security: 'Payment Security',
    cil: 'Change-in-Law Relief',
    recs: 'REC Portfolio',
    termination: 'PPA Termination',
    revenue: 'Revenue Assurance',
  };

  return (
    <AppShell
      role="offtaker"
      userName="Refilwe Dlamini"
      userEmail="offtaker@openenergy.co.za"
      navConfig={liveNavConfig}
      breadcrumbs={[{ label: 'Offtaker' }, { label: screenLabel[activeScreen] }]}
      alerts={[
        {
          id: 'alert1',
          message: 'Take-or-pay exposure on PPA-OT-P003 — R4.2M trigger in 8 days',
          variant: 'rose',
          href: '#take-or-pay',
          dismissible: true,
        },
        {
          id: 'alert2',
          message: 'Tariff indexation review open — CPI 6.2% received, response due in 23 days',
          variant: 'amber',
          href: '#tariff',
          dismissible: true,
        },
      ]}
    >
      {activeScreen === 'analytics'    ? <OfftakerAnalytics />
     : activeScreen === 'ppas'         ? <PpasScreen />
     : activeScreen === 'delivery'     ? <DeliveryScreen />
     : activeScreen === 'tariff'       ? <TariffScreen />
     : activeScreen === 'top'          ? <TopScreen />
     : activeScreen === 'curtailment'  ? <CurtailmentScreen />
     : activeScreen === 'security'     ? <SecurityScreen />
     : activeScreen === 'cil'          ? <CilScreen />
     : activeScreen === 'recs'          ? <RecsScreen />
     : activeScreen === 'termination'   ? <TerminationScreen />
     : activeScreen === 'revenue'       ? <RevenueScreen />
     : (
      <>
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: 'var(--oe-text-1)',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}
          >
            PPA Portfolio
          </div>
          <div style={{ fontSize: '13px', color: 'var(--oe-text-3)', marginTop: '3px' }}>
            {ppasLoading
              ? 'Loading…'
              : `${activePpas} active contract${activePpas !== 1 ? 's' : ''} · ${totalContractedMw} MW`}
          </div>
        </div>

        {/* KPI row */}
        <StatGrid cols={4}>
          <StatCard
            label="Contracted Capacity"
            value={ppasLoading ? '—' : String(totalContractedMw)}
            unit="MW"
            delta={ppasLoading ? '' : `${activePpas} active PPA${activePpas !== 1 ? 's' : ''}`}
            icon="lightning"
            variant="navy"
          />
          <StatCard
            label="YTD Energy Delivered"
            value="1,842"
            unit="GWh"
            delta="94.2% of schedule"
            positive
            icon="chart-line"
            variant="green"
          />
          <StatCard
            label="Take-or-Pay Exposure"
            value={totalShortfall > 0 ? `${totalShortfall.toLocaleString()} MWh` : 'None'}
            subtext="Current shortfall vs minimum"
            icon="scales"
            variant="amber"
          />
          <StatCard
            label="Top Tariff"
            value={topTariff > 0 ? `R${topTariff.toLocaleString()}` : '—'}
            unit="/MWh"
            subtext="Latest indexation rate"
            icon="calendar"
            variant="amber"
          />
        </StatGrid>

        {/* Two-column body */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 320px',
            gap: '16px',
            marginTop: '20px',
          }}
        >
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '16px' }}>
            {/* Active PPAs */}
            <div>
              <SectionHeading title="Active PPAs" />
              <DataTable<OfftakerPpa>
                columns={ppaColumns}
                rows={ppas}
                loading={ppasLoading}
                compact
              />
            </div>

            {/* Monthly delivery vs contract */}
            <div>
              <SectionHeading title="Monthly Delivery vs Contract" />
              <DataTable<DeliveryRow>
                columns={deliveryColumns}
                rows={deliveryRows}
                compact
              />
            </div>

            {/* Tariff indexation state flow */}
            <Card>
              <SectionHeading title="Tariff Indexation — Annual CPI Review" />
              <StateFlow steps={tariffSteps} />
            </Card>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '16px' }}>
            {/* AI Insight */}
            <AIInsightCard
              title="Take-or-Pay Alert"
              suggestion="Limpopo BESS PPA-OT-P003 is 13% below minimum contracted delivery. At current trajectory, take-or-pay payment of R4.2M will be triggered in 8 days. Request curtailment compensation or renegotiate minimum."
              reasoning="Take-or-pay minimum is calculated at 90% of contracted monthly MWh per PPA-OT-P003 clause 8.3. April delivery at 87% created an R2.1M shortfall; May on track at 91% will partially offset. If June stays at current run-rate of 85%, the cumulative 13% shortfall crosses the quantum threshold and automatically triggers the take-or-pay clause with 3-business-day cure window."
              confidence="high"
            />

            {/* Chain map */}
            <ChainMap
              chainLabel="PPA-OT-P003 Limpopo BESS"
              chainType="PPA Contract"
              currentState="Cure Window"
              links={chainLinks}
            />

            {/* Action panel */}
            <ActionPanel
              actions={[
                {
                  id: 'initiate-top',
                  label: 'Initiate Take-or-Pay',
                  icon: 'scales',
                  variant: 'danger',
                  form: (
                    <TransitionForm
                      actionLabel="Initiate Take-or-Pay"
                      reasonCodes={[
                        { value: 'shortfall',     label: 'Delivery shortfall confirmed' },
                        { value: 'force_majeure', label: 'Force majeure — disputed' },
                      ]}
                      onSubmit={async () => {
                        await apexClient.offtaker.listPpas({ status: 'cure_window' });
                      }}
                      confirmMessage="This will formally initiate a take-or-pay claim against PPA-OT-P003. The seller will be notified and a 3-business-day cure window will begin. This action is recorded in the audit chain."
                    />
                  ),
                },
                {
                  id: 'curtailment-comp',
                  label: 'Raise Curtailment Claim',
                  icon: 'send',
                  variant: 'primary',
                  form: (
                    <TransitionForm
                      actionLabel="Raise Curtailment Claim"
                      reasonCodes={[
                        { value: 'grid_curtailment', label: 'Grid-instructed curtailment' },
                        { value: 'so_instruction',   label: 'SO dispatch instruction' },
                        { value: 'force_majeure',    label: 'Force majeure' },
                      ]}
                      onSubmit={async () => {
                        await apexClient.offtaker.listDeliveries({ period: 'mtd' });
                      }}
                      confirmMessage="This will raise a formal curtailment compensation claim. The IPP developer will be notified and the claim will enter the W46 review workflow."
                    />
                  ),
                },
                {
                  id: 'export-statement',
                  label: 'Export Monthly Statement',
                  icon: 'export',
                  variant: 'ghost',
                  onClick: async () => {
                    await apexClient.offtaker.listDeliveries({ period: 'mtd' });
                  },
                },
              ]}
            />
          </div>
        </div>
      </>
    )}
    </AppShell>
  );
}

export default OfftakerWorkstation;
