/**
 * Grid Workstation — Apex design
 *
 * Dispatch board, curtailment orders, nominations, reserve activations,
 * capacity allocations, GCA, wheeling, grid code compliance.
 */

import React, { useState } from 'react';
import { GridAnalytics } from '../analytics/GridAnalytics';
import { AppShell, NavConfig } from '../../components/shell/AppShell';
import { StatCard, StatGrid } from '../../components/display/StatCard';
import { DataTable, Column } from '../../components/display/DataTable';
import { StatusPill, stateVariant } from '../../components/display/StatusPill';
import { AIInsightCard } from '../../components/display/AIInsightCard';
import { ChainMap, ChainLink } from '../../components/display/ChainMap';
import { ActionPanel } from '../../components/actions/ActionPanel';
import { TransitionForm } from '../../components/actions/TransitionForm';
import { StateFlow, StateFlowStep } from '../../components/display/StateFlow';
import { Timeline, TimelineEvent } from '../../components/display/Timeline';
import { DetailDrawer, DrawerField, DrawerAction } from '../../components/display/DetailDrawer';
import {
  useGridNominations, useGridCurtailments, useGridConnections, useGridReserveActivations,
  useAuditBlocks,
} from '../../lib/hooks';
import {
  GridNomination, GridCurtailment, GridConnection, GridReserveActivation, AuditBlock, apexClient,
} from '../../lib/client';

type ActiveScreen =
  | 'dashboard'
  | 'nominations'
  | 'curtailments'
  | 'connections'
  | 'reserve'
  | 'gca'
  | 'wheeling'
  | 'compliance'
  | 'analytics'
  | 'capacity'
  | 'outage';

// ─── Nav config ───────────────────────────────────────────────────────────────

const GRID_NAV: NavConfig = {
  activeId: 'grid-dashboard',
  sections: [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { id: 'grid-dashboard',  label: 'Dashboard',      href: '#dashboard',  icon: 'home' },
        { id: 'grid-dispatch',   label: 'Dispatch Board', href: '#dispatch',   icon: 'lightning' },
        { id: 'grid-analytics',  label: 'Analytics',      href: '#analytics',  icon: 'chart-line' },
      ],
    },
    {
      id: 'operations',
      label: 'Operations',
      items: [
        { id: 'grid-noms',       label: 'Nominations W13',            href: '#noms',       icon: 'hierarchy',      badge: 3, badgeVariant: 'amber' },
        { id: 'grid-curtail',    label: 'Load Curtailment W34',        href: '#curtail',    icon: 'alert-triangle', badge: 1, badgeVariant: 'rose'  },
        { id: 'grid-ancillary',  label: 'Ancillary Services W50',      href: '#ancillary',  icon: 'scales' },
        { id: 'grid-energize',   label: 'Connection Energization W75', href: '#energize',   icon: 'tower' },
      ],
    },
    {
      id: 'capacity',
      label: 'Capacity & Connections',
      items: [
        { id: 'grid-cap-alloc',  label: 'Capacity Allocations W58', href: '#cap-alloc',  icon: 'blueprint' },
        { id: 'grid-capacity',   label: 'Capacity Queue',            href: '#capacity',   icon: 'chain' },
        { id: 'grid-gca',        label: 'GCA W28',                   href: '#gca',        icon: 'link' },
        { id: 'grid-outage',     label: 'Planned Outages',           href: '#outage',     icon: 'clock' },
        { id: 'grid-code-comp',  label: 'Grid Code Compliance W67',  href: '#code-comp',  icon: 'shield' },
      ],
    },
    {
      id: 'settlements',
      label: 'Settlements',
      items: [
        { id: 'grid-wheeling',   label: 'Wheeling Charges W8',     href: '#wheeling',   icon: 'dollar' },
        { id: 'grid-reserve',    label: 'Reserve Activation W50',  href: '#reserve',    icon: 'lightning' },
      ],
    },
    {
      id: 'reports',
      label: 'Reports',
      defaultCollapsed: true,
      items: [
        { id: 'grid-rpt-code',    label: 'Grid Code Report',   href: '#rpt-code',    icon: 'report' },
        { id: 'grid-rpt-outage',  label: 'Outage Report',      href: '#rpt-outage',  icon: 'certificate' },
        { id: 'grid-rpt-curtail', label: 'Curtailment Log',    href: '#rpt-curtail', icon: 'stamp' },
        { id: 'grid-settings',    label: 'Settings',           href: '#settings',    icon: 'gear' },
      ],
    },
  ],
};

// ─── Static display data ──────────────────────────────────────────────────────

const NOM_STEPS: StateFlowStep[] = [
  { id: 'submitted',      label: 'Submitted',       status: 'complete', timestamp: '14:00' },
  { id: 'capacity_check', label: 'Capacity Check',  status: 'complete', timestamp: '14:15' },
  { id: 'so_review',      label: 'SO Review',       status: 'current',  sublabel: 'Peak demand assessment' },
  { id: 'confirmed',      label: 'Confirmed',       status: 'pending' },
  { id: 'activated',      label: 'Activated',       status: 'pending' },
  { id: 'settled',        label: 'Settled',         status: 'pending' },
];

const GRID_EVENTS: TimelineEvent[] = [
  { id: 'ge1', timestamp: '08:32', actor: 'SO Dispatch',    action: 'Stage 2 curtailment activated',           icon: 'alert-triangle', hash: '4a2c91' },
  { id: 'ge2', timestamp: '08:00', actor: 'Grid SCADA',     action: 'Frequency deviation 49.94 Hz detected',   icon: 'lightning',      hash: '7f3b22' },
  { id: 'ge3', timestamp: '07:30', actor: 'SO Dispatch',    action: 'Load curtailment order issued',           icon: 'send',           hash: 'c8e14d' },
  { id: 'ge4', timestamp: '06:45', actor: 'NTCSA Planning', action: 'Day-ahead capacity assessment complete',  icon: 'checklist',      hash: '29da05' },
];

const CURTAIL_CHAIN_LINKS: ChainLink[] = [
  { id: 'cl1', label: 'Reserve Activation',    chainType: 'Ancillary Services W50',   state: 'standby', role: 'Grid Operator',  relationship: 'child'      },
  { id: 'cl2', label: 'Boland Solar NOM-001',  chainType: 'Dispatch Nomination W13',  state: 'active',  role: 'IPP Developer',  relationship: 'cross-role' },
  { id: 'cl3', label: 'Regulator REG-002',     chainType: 'Grid Code Compliance',     state: 'open',    role: 'Regulator',      relationship: 'cross-role' },
];

// ─── Column definitions ───────────────────────────────────────────────────────

const NOM_COLS: Column<GridNomination>[] = [
  {
    key: 'id',
    header: 'NOM ID',
    width: '110px',
    mono: true,
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>
        {row.id.slice(0, 8)}
      </span>
    ),
  },
  {
    key: 'brp',
    header: 'BRP / Generator',
    render: (row) => (
      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--oe-text-1)' }}>{row.brp}</span>
    ),
  },
  {
    key: 'energy_type',
    header: 'Type',
    width: '80px',
    render: (row) => (
      <span style={{ fontSize: '11px', color: 'var(--oe-text-2)', textTransform: 'uppercase' }}>{row.energy_type}</span>
    ),
  },
  {
    key: 'nominated_mw',
    header: 'MW Nominated',
    width: '110px',
    mono: true,
    align: 'right',
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>
        {row.nominated_mw.toFixed(1)}
      </span>
    ),
  },
  {
    key: 'dispatched_mw',
    header: 'MW Dispatched',
    width: '110px',
    mono: true,
    align: 'right',
    render: (row) => {
      const val = row.dispatched_mw;
      return (
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: val == null ? 'var(--oe-text-3)' : 'var(--oe-text-1)' }}>
          {val == null ? '—' : val.toFixed(1)}
        </span>
      );
    },
  },
  {
    key: 'deviation_pct',
    header: 'Dev %',
    width: '70px',
    mono: true,
    align: 'right',
    render: (row) => {
      const pct = row.deviation_pct;
      const color = pct == null ? 'var(--oe-text-3)'
        : Math.abs(pct) > 10 ? 'var(--oe-rose)'
        : Math.abs(pct) > 5  ? 'var(--oe-amber)'
        : 'var(--oe-text-1)';
      return (
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color, fontWeight: pct != null && Math.abs(pct) > 5 ? 600 : 400 }}>
          {pct == null ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}
        </span>
      );
    },
  },
  {
    key: 'status',
    header: 'Status',
    width: '90px',
    render: (row) => (
      <StatusPill
        label={row.status}
        variant={row.status === 'rejected' ? 'rose' : stateVariant(row.status)}
        size="sm"
      />
    ),
  },
];

const CURTAIL_COLS: Column<GridCurtailment>[] = [
  {
    key: 'event_ref',
    header: 'Event Ref',
    width: '90px',
    mono: true,
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>
        {row.event_ref}
      </span>
    ),
  },
  {
    key: 'affected_zone',
    header: 'Zone',
    render: (row) => (
      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--oe-text-1)' }}>{row.affected_zone}</span>
    ),
  },
  {
    key: 'stage',
    header: 'Stage',
    width: '60px',
    mono: true,
    align: 'right',
    render: (row) => {
      const isHigh = row.stage >= 4;
      return (
        <span style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '12px',
          fontWeight: 700,
          color: isHigh ? 'var(--oe-rose)' : 'var(--oe-text-1)',
        }}>
          {row.stage}
        </span>
      );
    },
  },
  {
    key: 'shed_mw',
    header: 'MW Shed',
    width: '90px',
    mono: true,
    align: 'right',
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: 'var(--oe-rose)', fontWeight: 600 }}>
        {row.shed_mw.toFixed(0)}
      </span>
    ),
  },
  {
    key: 'duration_min',
    header: 'Duration',
    width: '80px',
    render: (row) => (
      <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{row.duration_min} min</span>
    ),
  },
  {
    key: 'cause',
    header: 'Cause',
    render: (row) => (
      <span style={{ fontSize: '11px', color: 'var(--oe-text-2)' }}>{row.cause}</span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: '100px',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} size="sm" />,
  },
];

const CONN_COLS: Column<GridConnection>[] = [
  {
    key: 'project_name',
    header: 'Project',
    render: (row) => (
      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--oe-text-1)' }}>
        {row.project_name ?? row.project_id.slice(0, 8)}
      </span>
    ),
  },
  {
    key: 'connection_point',
    header: 'Connection Point',
    render: (row) => (
      <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{row.connection_point}</span>
    ),
  },
  {
    key: 'voltage_kv',
    header: 'Voltage kV',
    width: '90px',
    mono: true,
    align: 'right',
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>{row.voltage_kv}</span>
    ),
  },
  {
    key: 'export_capacity_mw',
    header: 'Export MW',
    width: '90px',
    mono: true,
    align: 'right',
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>{row.export_capacity_mw.toFixed(1)}</span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: '110px',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} size="sm" />,
  },
  {
    key: 'connected_date',
    header: 'Connected',
    width: '100px',
    render: (row) => (
      <span style={{ fontSize: '11px', color: 'var(--oe-text-3)' }}>{row.connected_date ?? '—'}</span>
    ),
  },
];

const RESERVE_COLS: Column<GridReserveActivation>[] = [
  {
    key: 'activation_ref',
    header: 'Ref',
    width: '100px',
    mono: true,
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>
        {row.activation_ref}
      </span>
    ),
  },
  {
    key: 'reserve_type',
    header: 'Type',
    width: '80px',
    render: (row) => (
      <span style={{ fontSize: '11px', color: 'var(--oe-text-2)', textTransform: 'uppercase' }}>{row.reserve_type}</span>
    ),
  },
  {
    key: 'activation_datetime',
    header: 'Activation',
    width: '120px',
    render: (row) => (
      <span style={{ fontSize: '11px', color: 'var(--oe-text-3)' }}>{row.activation_datetime}</span>
    ),
  },
  {
    key: 'provider',
    header: 'Provider',
    render: (row) => (
      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--oe-text-1)' }}>{row.provider}</span>
    ),
  },
  {
    key: 'contracted_mw',
    header: 'Contracted MW',
    width: '110px',
    mono: true,
    align: 'right',
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>{row.contracted_mw.toFixed(1)}</span>
    ),
  },
  {
    key: 'delivered_mw',
    header: 'Delivered MW',
    width: '110px',
    mono: true,
    align: 'right',
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: row.delivered_mw == null ? 'var(--oe-text-3)' : 'var(--oe-text-1)' }}>
        {row.delivered_mw == null ? '—' : row.delivered_mw.toFixed(1)}
      </span>
    ),
  },
  {
    key: 'settlement_zar',
    header: 'Settlement',
    width: '100px',
    mono: true,
    align: 'right',
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: row.settlement_zar == null ? 'var(--oe-text-3)' : 'var(--oe-green)' }}>
        {row.settlement_zar == null ? '—' : 'R' + (row.settlement_zar / 1e6).toFixed(1) + 'M'}
      </span>
    ),
  },
  {
    key: 'penalty_applied',
    header: 'Penalty',
    width: '70px',
    align: 'center',
    render: (row) => (
      <span style={{ fontSize: '12px', fontWeight: 600, color: row.penalty_applied ? 'var(--oe-rose)' : 'var(--oe-green)' }}>
        {row.penalty_applied ? 'Yes' : 'No'}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: '90px',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} size="sm" />,
  },
];

// ─── Audit table columns ──────────────────────────────────────────────────────

const AUDIT_COLS: Column<AuditBlock>[] = [
  {
    key: 'id',
    header: 'Ref',
    width: '80px',
    mono: true,
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>
        {row.id.slice(-8)}
      </span>
    ),
  },
  {
    key: 'action',
    header: 'Action',
    render: (row) => (
      <span style={{ fontSize: '12px', color: 'var(--oe-text-1)' }}>{row.action.replace(/_/g, ' ')}</span>
    ),
  },
  {
    key: 'actor_name',
    header: 'Actor',
    render: (row) => (
      <span style={{ fontSize: '11px', color: 'var(--oe-text-2)' }}>{row.actor_name ?? row.actor_id.slice(0, 8)}</span>
    ),
  },
  {
    key: 'timestamp',
    header: 'Date',
    width: '130px',
    render: (row) => (
      <span style={{ fontSize: '11px', color: 'var(--oe-text-3)' }}>{row.timestamp}</span>
    ),
  },
];

// ─── Section header helper ────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--oe-text-1)' }}>{title}</div>
      {subtitle && (
        <div style={{ fontSize: '11px', color: 'var(--oe-text-3)', marginTop: '2px' }}>{subtitle}</div>
      )}
    </div>
  );
}

// ─── Sub-screen components ────────────────────────────────────────────────────

function NominationsScreen() {
  const { data, loading, refetch } = useGridNominations();
  const [selected, setSelected] = React.useState<GridNomination | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const nomFields: DrawerField[] = selected ? [
    { label: 'Nomination ID',   value: selected.id,              mono: true, span: true },
    { label: 'Date',            value: selected.date },
    { label: 'BRP / Generator', value: selected.brp },
    { label: 'Energy Type',     value: selected.energy_type.toUpperCase() },
    { label: 'Nominated MW',    value: selected.nominated_mw.toFixed(1),         mono: true },
    { label: 'Dispatched MW',   value: selected.dispatched_mw != null ? selected.dispatched_mw.toFixed(1) : '—', mono: true },
    { label: 'Deviation MW',    value: selected.deviation_mw != null ? selected.deviation_mw.toFixed(1) : '—',  mono: true },
    { label: 'Deviation %',     value: selected.deviation_pct != null ? `${selected.deviation_pct > 0 ? '+' : ''}${selected.deviation_pct.toFixed(1)}%` : '—', mono: true },
    { label: 'Reserve Penalty', value: selected.reserve_penalty_zar != null ? `R${selected.reserve_penalty_zar.toLocaleString()}` : '—', mono: true },
    { label: 'Status',          value: <StatusPill label={selected.status} variant={stateVariant(selected.status)} size="sm" /> },
  ] : [];

  const nomActions: DrawerAction[] = selected ? [
    {
      id: 'confirm',
      label: 'Confirm Nomination',
      icon: 'check',
      variant: 'primary' as const,
      disabled: selected.status !== 'submitted' && selected.status !== 'pending',
      disabledReason: 'Nomination must be in submitted or pending state',
      onClick: async () => { /* handled by form */ },
      form: (
        <TransitionForm
          actionLabel="Confirm Nomination"
          fields={[
            { key: 'confirmed_mw', label: 'Confirmed MW', type: 'number', required: true, placeholder: 'e.g. 38' },
            { key: 'dispatch_window', label: 'Dispatch Window', type: 'text', required: true, placeholder: 'e.g. 17:00–21:00' },
          ]}
          requireReason={false}
          onSubmit={async (data) => {
            await apexClient.grid.confirmNomination(selected.id, data);
            refetch();
          }}
        />
      ),
    },
    {
      id: 'view-audit',
      label: 'View Audit Trail',
      icon: 'report',
      variant: 'secondary' as const,
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'grid_nomination', entity_id: selected.id });
      },
    },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Dispatch Nominations</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <DataTable<GridNomination>
        columns={NOM_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? selected.brp : ''}
        subtitle={selected ? `${selected.energy_type.toUpperCase()} · ${selected.date}` : ''}
        entityRef={selected ? selected.id.slice(0, 8) : ''}
        status={selected?.status}
        statusVariant={selected ? stateVariant(selected.status) : 'default'}
        fields={nomFields}
        actions={nomActions}
        onActionComplete={() => { refetch(); setDrawerOpen(false); }}
      />
    </div>
  );
}

function CurtailmentsScreen() {
  const { data, loading, refetch } = useGridCurtailments();
  const [selected, setSelected] = React.useState<GridCurtailment | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const curtailFields: DrawerField[] = selected ? [
    { label: 'Event Ref',        value: selected.event_ref,              mono: true },
    { label: 'Event Date',       value: selected.event_date },
    { label: 'Stage',            value: String(selected.stage),          mono: true },
    { label: 'Affected Zone',    value: selected.affected_zone },
    { label: 'MW Shed',          value: selected.shed_mw.toFixed(0),     mono: true },
    { label: 'Duration',         value: `${selected.duration_min} min` },
    { label: 'Cause',            value: selected.cause,                  span: true },
    { label: 'Compensation',     value: selected.compensation_zar != null ? `R${selected.compensation_zar.toLocaleString()}` : '—', mono: true },
    { label: 'Status',           value: <StatusPill label={selected.status} variant={stateVariant(selected.status)} size="sm" /> },
  ] : [];

  const curtailActions: DrawerAction[] = selected ? [
    {
      id: 'escalate',
      label: 'Escalate to NERSA',
      icon: 'send',
      variant: 'danger',
      disabled: selected.status !== 'active' && selected.status !== 'instructed',
      disabledReason: 'Curtailment must be active or instructed',
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'grid_curtailment', entity_id: selected.id });
        refetch();
      },
    },
    {
      id: 'audit',
      label: 'View Audit Trail',
      icon: 'report',
      variant: 'secondary',
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'grid_curtailment', entity_id: selected.id });
      },
    },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Load Curtailment Orders</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <DataTable<GridCurtailment>
        columns={CURTAIL_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `Zone: ${selected.affected_zone}` : ''}
        subtitle={selected ? `Stage ${selected.stage} · ${selected.cause}` : ''}
        entityRef={selected ? selected.event_ref : ''}
        status={selected?.status}
        statusVariant={selected ? stateVariant(selected.status) : 'default'}
        fields={curtailFields}
        actions={curtailActions}
        onActionComplete={() => { refetch(); setDrawerOpen(false); }}
      />
    </div>
  );
}

function ConnectionsScreen() {
  const { data, loading, refetch } = useGridConnections();
  const [selected, setSelected] = React.useState<GridConnection | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const connFields: DrawerField[] = selected ? [
    { label: 'Connection ID',     value: selected.id,                                   mono: true, span: true },
    { label: 'Project',           value: selected.project_name ?? selected.project_id.slice(0, 8) },
    { label: 'Project ID',        value: selected.project_id,                           mono: true },
    { label: 'Connection Point',  value: selected.connection_point },
    { label: 'Voltage (kV)',      value: String(selected.voltage_kv),                   mono: true },
    { label: 'Export MW',         value: selected.export_capacity_mw.toFixed(1),        mono: true },
    { label: 'Import MW',         value: selected.import_capacity_mw.toFixed(1),        mono: true },
    { label: 'Meter ID',          value: selected.meter_id ?? '—',                      mono: true },
    { label: 'Connected Date',    value: selected.connected_date ?? '—' },
    { label: 'Status',            value: <StatusPill label={selected.status} variant={stateVariant(selected.status)} size="sm" /> },
  ] : [];

  const connActions: DrawerAction[] = selected ? [
    {
      id: 'energise',
      label: 'Authorise Energization',
      icon: 'lightning',
      variant: 'primary',
      disabled: selected.status !== 'connection_ready' && selected.status !== 'pending',
      disabledReason: 'Connection must be in connection_ready or pending state',
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'grid_connection', entity_id: selected.id });
        refetch();
      },
    },
    {
      id: 'suspend',
      label: 'Suspend Connection',
      icon: 'alert-triangle',
      variant: 'danger',
      disabled: selected.status === 'suspended' || selected.status === 'cancelled',
      disabledReason: 'Connection is already suspended or cancelled',
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'grid_connection', entity_id: selected.id });
        refetch();
      },
    },
    {
      id: 'audit',
      label: 'View Audit Trail',
      icon: 'report',
      variant: 'secondary',
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'grid_connection', entity_id: selected.id });
      },
    },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Grid Connections</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <DataTable<GridConnection>
        columns={CONN_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? (selected.project_name ?? selected.project_id.slice(0, 8)) : ''}
        subtitle={selected ? `${selected.connection_point} · ${selected.voltage_kv} kV` : ''}
        entityRef={selected ? selected.id.slice(0, 8) : ''}
        status={selected?.status}
        statusVariant={selected ? stateVariant(selected.status) : 'default'}
        fields={connFields}
        actions={connActions}
        onActionComplete={() => { refetch(); setDrawerOpen(false); }}
      />
    </div>
  );
}

function ReserveScreen() {
  const { data, loading, refetch } = useGridReserveActivations();
  const [selected, setSelected] = React.useState<GridReserveActivation | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const reserveFields: DrawerField[] = selected ? [
    { label: 'Activation Ref',   value: selected.activation_ref,          mono: true },
    { label: 'Reserve Type',     value: selected.reserve_type.toUpperCase() },
    { label: 'Activation Time',  value: selected.activation_datetime },
    { label: 'Provider',         value: selected.provider },
    { label: 'Contracted MW',    value: selected.contracted_mw.toFixed(1),  mono: true },
    { label: 'Delivered MW',     value: selected.delivered_mw != null ? selected.delivered_mw.toFixed(1) : '—', mono: true },
    { label: 'Response Time',    value: selected.response_time_s != null ? `${selected.response_time_s}s` : '—', mono: true },
    { label: 'Settlement',       value: selected.settlement_zar != null ? `R${(selected.settlement_zar / 1e6).toFixed(2)}M` : '—', mono: true },
    { label: 'Penalty Applied',  value: selected.penalty_applied ? 'Yes' : 'No' },
    { label: 'Status',           value: <StatusPill label={selected.status} variant={stateVariant(selected.status)} size="sm" /> },
  ] : [];

  const reserveActions: DrawerAction[] = selected ? [
    {
      id: 'settle',
      label: 'Process Settlement',
      icon: 'dollar',
      variant: 'primary',
      disabled: selected.status !== 'activated' && selected.status !== 'delivered',
      disabledReason: 'Reserve activation must be in activated or delivered state',
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'reserve_activation', entity_id: selected.id });
        refetch();
      },
    },
    {
      id: 'flag-penalty',
      label: 'Flag Penalty',
      icon: 'alert-triangle',
      variant: 'danger',
      disabled: selected.penalty_applied,
      disabledReason: 'Penalty already applied',
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'reserve_activation', entity_id: selected.id });
        refetch();
      },
    },
    {
      id: 'audit',
      label: 'View Audit Trail',
      icon: 'report',
      variant: 'secondary',
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'reserve_activation', entity_id: selected.id });
      },
    },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Reserve Activations</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <DataTable<GridReserveActivation>
        columns={RESERVE_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? selected.provider : ''}
        subtitle={selected ? `${selected.reserve_type.toUpperCase()} · ${selected.activation_datetime}` : ''}
        entityRef={selected ? selected.activation_ref : ''}
        status={selected?.status}
        statusVariant={selected ? stateVariant(selected.status) : 'default'}
        fields={reserveFields}
        actions={reserveActions}
        onActionComplete={() => { refetch(); setDrawerOpen(false); }}
      />
    </div>
  );
}

function GcaScreen() {
  const { data: auditData, loading: auditLoading, refetch } = useAuditBlocks({ entity_type: 'grid_connection_agreement' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const auditFields: DrawerField[] = selected ? [
    { label: 'Block ID',     value: selected.id,                        mono: true, span: true },
    { label: 'Seq',          value: String(selected.seq),               mono: true },
    { label: 'Action',       value: selected.action.replace(/_/g, ' ') },
    { label: 'Actor',        value: selected.actor_name ?? selected.actor_id, mono: true },
    { label: 'Actor Role',   value: selected.actor_role ?? '—' },
    { label: 'Entity Type',  value: selected.entity_type },
    { label: 'Entity ID',    value: selected.entity_id,                 mono: true },
    { label: 'Hash',         value: selected.hash,                      mono: true, span: true },
    { label: 'Prev Hash',    value: selected.prev_hash ?? '—',          mono: true, span: true },
    { label: 'Timestamp',    value: selected.timestamp },
  ] : [];

  const cardStyle: React.CSSProperties = {
    background: 'var(--oe-canvas)',
    border: '1px solid var(--oe-border)',
    borderRadius: 'var(--oe-r-card)',
    boxShadow: 'var(--oe-shadow-card)',
    padding: '16px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Grid Connection Agreements</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W28 · NERSA Grid Code C-1</div>
      </div>

      <ActionPanel
        title="GCA Actions"
        actions={[
          {
            id: 'initiate-gca',
            label: 'Initiate GCA W28',
            icon: 'send',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Initiate Grid Connection Agreement"
                fields={[
                  { key: 'project_id',        label: 'Project ID',        type: 'text',   required: true,  placeholder: 'e.g. proj-001' },
                  { key: 'connection_point',  label: 'Connection Point',  type: 'text',   required: true,  placeholder: 'e.g. Boland 132kV' },
                  { key: 'voltage_kv',        label: 'Voltage (kV)',       type: 'number', required: true,  placeholder: 'e.g. 132' },
                  { key: 'export_mw',         label: 'Export Capacity MW', type: 'number', required: true,  placeholder: 'e.g. 100' },
                ]}
                requireReason={false}
                onSubmit={async (_data) => {
                  await apexClient.audit.listBlocks({ entity_type: 'grid_connection_agreement' }).then(() => refetch());
                }}
              />
            ),
          },
          {
            id: 'refresh',
            label: 'Refresh Activity Log',
            icon: 'report',
            variant: 'secondary',
            onClick: async () => { refetch(); },
          },
        ]}
      />

      <div style={cardStyle}>
        <SectionHeader
          title="GCA Activity Log"
          subtitle={auditLoading ? 'Loading…' : `${auditData.length} audit block${auditData.length !== 1 ? 's' : ''}`}
        />
        <DataTable<AuditBlock>
          columns={AUDIT_COLS}
          rows={auditData}
          loading={auditLoading}
          onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        />
      </div>

      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? selected.action.replace(/_/g, ' ') : ''}
        subtitle={selected ? `${selected.entity_type} · ${selected.timestamp}` : ''}
        entityRef={selected ? selected.id.slice(-8) : ''}
        fields={auditFields}
        onActionComplete={() => { refetch(); setDrawerOpen(false); }}
      />
    </div>
  );
}

function WheelingScreen() {
  const { data: auditData, loading: auditLoading, refetch } = useAuditBlocks({ entity_type: 'wheeling_charge' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const auditFields: DrawerField[] = selected ? [
    { label: 'Block ID',     value: selected.id,                        mono: true, span: true },
    { label: 'Seq',          value: String(selected.seq),               mono: true },
    { label: 'Action',       value: selected.action.replace(/_/g, ' ') },
    { label: 'Actor',        value: selected.actor_name ?? selected.actor_id, mono: true },
    { label: 'Actor Role',   value: selected.actor_role ?? '—' },
    { label: 'Entity Type',  value: selected.entity_type },
    { label: 'Entity ID',    value: selected.entity_id,                 mono: true },
    { label: 'Hash',         value: selected.hash,                      mono: true, span: true },
    { label: 'Prev Hash',    value: selected.prev_hash ?? '—',          mono: true, span: true },
    { label: 'Timestamp',    value: selected.timestamp },
  ] : [];

  const cardStyle: React.CSSProperties = {
    background: 'var(--oe-canvas)',
    border: '1px solid var(--oe-border)',
    borderRadius: 'var(--oe-r-card)',
    boxShadow: 'var(--oe-shadow-card)',
    padding: '16px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Wheeling Charges</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W8 · Transmission charge lifecycle</div>
      </div>

      <ActionPanel
        title="Wheeling Actions"
        actions={[
          {
            id: 'raise-dispute',
            label: 'Raise Wheeling Dispute',
            icon: 'alert-triangle',
            variant: 'danger',
            form: (
              <TransitionForm
                actionLabel="Raise Wheeling Charge Dispute"
                fields={[
                  { key: 'charge_ref',    label: 'Charge Reference',  type: 'text',   required: true,  placeholder: 'e.g. WHE-2026-001' },
                  { key: 'disputed_zar',  label: 'Disputed Amount (R)', type: 'number', required: true,  placeholder: 'e.g. 125000' },
                  { key: 'period',        label: 'Billing Period',    type: 'text',   required: true,  placeholder: 'e.g. 2026-05' },
                ]}
                requireReason
                reasonCodes={[
                  { value: 'meter_error',       label: 'Metering error' },
                  { value: 'calc_error',        label: 'Calculation error' },
                  { value: 'tariff_mismatch',   label: 'Tariff rate mismatch' },
                  { value: 'zone_mismatch',     label: 'Zone classification dispute' },
                ]}
                onSubmit={async (_data) => {
                  await apexClient.audit.listBlocks({ entity_type: 'wheeling_charge' }).then(() => refetch());
                }}
              />
            ),
          },
          {
            id: 'refresh',
            label: 'Refresh Activity Log',
            icon: 'report',
            variant: 'secondary',
            onClick: async () => { refetch(); },
          },
        ]}
      />

      <div style={cardStyle}>
        <SectionHeader
          title="Wheeling Activity Log"
          subtitle={auditLoading ? 'Loading…' : `${auditData.length} audit block${auditData.length !== 1 ? 's' : ''}`}
        />
        <DataTable<AuditBlock>
          columns={AUDIT_COLS}
          rows={auditData}
          loading={auditLoading}
          onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        />
      </div>

      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? selected.action.replace(/_/g, ' ') : ''}
        subtitle={selected ? `${selected.entity_type} · ${selected.timestamp}` : ''}
        entityRef={selected ? selected.id.slice(-8) : ''}
        fields={auditFields}
        onActionComplete={() => { refetch(); setDrawerOpen(false); }}
      />
    </div>
  );
}

function ComplianceScreen() {
  const { data: auditData, loading: auditLoading, refetch } = useAuditBlocks({ entity_type: 'grid_code_compliance' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const auditFields: DrawerField[] = selected ? [
    { label: 'Block ID',     value: selected.id,                        mono: true, span: true },
    { label: 'Seq',          value: String(selected.seq),               mono: true },
    { label: 'Action',       value: selected.action.replace(/_/g, ' ') },
    { label: 'Actor',        value: selected.actor_name ?? selected.actor_id, mono: true },
    { label: 'Actor Role',   value: selected.actor_role ?? '—' },
    { label: 'Entity Type',  value: selected.entity_type },
    { label: 'Entity ID',    value: selected.entity_id,                 mono: true },
    { label: 'Hash',         value: selected.hash,                      mono: true, span: true },
    { label: 'Prev Hash',    value: selected.prev_hash ?? '—',          mono: true, span: true },
    { label: 'Timestamp',    value: selected.timestamp },
  ] : [];

  const cardStyle: React.CSSProperties = {
    background: 'var(--oe-canvas)',
    border: '1px solid var(--oe-border)',
    borderRadius: 'var(--oe-r-card)',
    boxShadow: 'var(--oe-shadow-card)',
    padding: '16px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Grid Code Compliance</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W67 · NERSA Grid Code / NRS 097</div>
      </div>

      <ActionPanel
        title="Compliance Actions"
        actions={[
          {
            id: 'raise-nonconformance',
            label: 'Raise Non-Conformance',
            icon: 'alert-triangle',
            variant: 'danger',
            form: (
              <TransitionForm
                actionLabel="Raise Grid Code Non-Conformance"
                fields={[
                  { key: 'facility_id',    label: 'Facility ID',           type: 'text',   required: true,  placeholder: 'e.g. boland-solar-001' },
                  { key: 'code_clause',    label: 'Grid Code Clause',       type: 'text',   required: true,  placeholder: 'e.g. C-7.2.1' },
                  { key: 'parameter',      label: 'Parameter',              type: 'text',   required: true,  placeholder: 'e.g. Power Factor' },
                  { key: 'measured_value', label: 'Measured Value',         type: 'text',   required: true,  placeholder: 'e.g. 0.89 lag' },
                  { key: 'limit_value',    label: 'Limit Value',            type: 'text',   required: true,  placeholder: 'e.g. 0.95 lag min' },
                ]}
                requireReason
                reasonCodes={[
                  { value: 'voltage_violation',       label: 'Voltage limit violation' },
                  { value: 'frequency_violation',     label: 'Frequency deviation' },
                  { value: 'power_factor_violation',  label: 'Power factor violation' },
                  { value: 'harmonic_distortion',     label: 'Harmonic distortion' },
                  { value: 'protection_failure',      label: 'Protection relay failure' },
                ]}
                confirmMessage="A non-conformance notice will be issued to the facility operator and logged in the NERSA Grid Code register."
                onSubmit={async (_data) => {
                  await apexClient.audit.listBlocks({ entity_type: 'grid_code_compliance' }).then(() => refetch());
                }}
              />
            ),
          },
          {
            id: 'schedule-inspection',
            label: 'Schedule Inspection',
            icon: 'send',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Schedule Compliance Inspection"
                fields={[
                  { key: 'facility_id',      label: 'Facility ID',       type: 'text', required: true, placeholder: 'e.g. boland-solar-001' },
                  { key: 'scheduled_date',   label: 'Scheduled Date',    type: 'text', required: true, placeholder: 'e.g. 2026-06-15' },
                  { key: 'inspection_type',  label: 'Inspection Type',   type: 'text', required: true, placeholder: 'e.g. annual / triggered' },
                ]}
                requireReason={false}
                onSubmit={async (_data) => {
                  await apexClient.audit.listBlocks({ entity_type: 'grid_code_compliance' }).then(() => refetch());
                }}
              />
            ),
          },
          {
            id: 'refresh',
            label: 'Refresh Activity Log',
            icon: 'report',
            variant: 'secondary',
            onClick: async () => { refetch(); },
          },
        ]}
      />

      <div style={cardStyle}>
        <SectionHeader
          title="Compliance Activity Log"
          subtitle={auditLoading ? 'Loading…' : `${auditData.length} audit block${auditData.length !== 1 ? 's' : ''}`}
        />
        <DataTable<AuditBlock>
          columns={AUDIT_COLS}
          rows={auditData}
          loading={auditLoading}
          onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        />
      </div>

      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? selected.action.replace(/_/g, ' ') : ''}
        subtitle={selected ? `${selected.entity_type} · ${selected.timestamp}` : ''}
        entityRef={selected ? selected.id.slice(-8) : ''}
        fields={auditFields}
        onActionComplete={() => { refetch(); setDrawerOpen(false); }}
      />
    </div>
  );
}

// ─── Grid Capacity Allocation (W58) ──────────────────────────────────────────

type CapacityRow = { id: string; ref: string; applicant_name: string; requested_mw: number; allocated_mw: number | null; substation: string; queue_position: number | null; chain_status: string; applied_at: string };

const CAPACITY_COLS: Column<CapacityRow>[] = [
  { key: 'ref',            header: 'Reference',    width: '150px', mono: true },
  { key: 'applicant_name', header: 'Applicant',    width: '200px' },
  { key: 'substation',     header: 'Substation',   width: '160px' },
  { key: 'requested_mw',   header: 'Requested MW', width: '110px', align: 'right', mono: true },
  { key: 'allocated_mw',   header: 'Allocated MW', width: '110px', align: 'right', mono: true, render: r => <span>{r.allocated_mw ?? '—'}</span> },
  { key: 'queue_position', header: 'Queue #',      width: '80px',  align: 'right', mono: true, render: r => <span>{r.queue_position ?? '—'}</span> },
  { key: 'chain_status',   header: 'Status',       width: '130px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" /> },
];

function CapacityScreen() {
  const [rows, setRows] = React.useState<CapacityRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<CapacityRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    apexClient.grid.listCapacityAllocations()
      .then(r => { setRows(r as CapacityRow[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const fields: DrawerField[] = sel ? [
    { label: 'Applicant',      value: sel.applicant_name, span: true },
    { label: 'Substation',     value: sel.substation },
    { label: 'Requested MW',   value: String(sel.requested_mw), mono: true },
    { label: 'Allocated MW',   value: sel.allocated_mw != null ? String(sel.allocated_mw) : '—', mono: true },
    { label: 'Queue Position', value: sel.queue_position != null ? String(sel.queue_position) : '—', mono: true },
    { label: 'Applied',        value: sel.applied_at, mono: true },
    { label: 'Status',         value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
  ] : [];

  const actions: DrawerAction[] = sel ? [
    {
      id: 'screen',
      label: 'Begin Screening',
      icon: 'checklist',
      variant: 'primary' as const,
      onClick: async () => {
        await apexClient.grid.beginCapacityScreening(sel.id);
        setDrawerOpen(false);
      },
    },
    {
      id: 'allocate',
      label: 'Allocate Capacity',
      icon: 'approve',
      variant: 'primary' as const,
      onClick: async () => {
        await apexClient.grid.allocateCapacity(sel.id);
        setDrawerOpen(false);
      },
    },
    {
      id: 'reject',
      label: 'Reject Application',
      icon: 'reject',
      variant: 'danger' as const,
      onClick: async () => {
        await apexClient.grid.rejectCapacityApplication(sel.id);
        setDrawerOpen(false);
      },
    },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Grid Capacity Allocation</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W58 · NTCSA 2024 Capacity Rules</div>
      </div>
      <DataTable<CapacityRow>
        columns={CAPACITY_COLS}
        rows={rows}
        loading={loading}
        onRowClick={row => { setSel(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={sel ? sel.ref : ''}
        subtitle={sel ? sel.applicant_name : ''}
        entityRef={sel ? sel.ref : ''}
        status={sel?.chain_status}
        statusVariant={sel ? stateVariant(sel.chain_status) : 'default'}
        fields={fields}
        actions={actions}
        onActionComplete={() => setDrawerOpen(false)}
      />
    </div>
  );
}

// ─── Planned Outage — Grid Operator (W18) ─────────────────────────────────────

type GridOutageRow = { id: string; ref: string; plant_name: string; requested_by: string; outage_type: string; requested_start: string; approved_start: string | null; duration_hours: number | null; chain_status: string };

const GRID_OUTAGE_COLS: Column<GridOutageRow>[] = [
  { key: 'ref',             header: 'Reference',   width: '150px', mono: true },
  { key: 'plant_name',      header: 'Plant',       width: '200px' },
  { key: 'outage_type',     header: 'Type',        width: '110px' },
  { key: 'requested_start', header: 'Requested',   width: '150px', mono: true },
  { key: 'approved_start',  header: 'Approved',    width: '150px', mono: true, render: r => <span>{r.approved_start ?? '—'}</span> },
  { key: 'duration_hours',  header: 'Hours',       width: '80px',  align: 'right', mono: true, render: r => <span>{r.duration_hours ?? '—'}</span> },
  { key: 'chain_status',    header: 'Status',      width: '130px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" /> },
];

function OutageScreen() {
  const [rows, setRows] = React.useState<GridOutageRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<GridOutageRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    apexClient.grid.listPlannedOutages()
      .then(r => { setRows(r as GridOutageRow[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const fields: DrawerField[] = sel ? [
    { label: 'Plant',           value: sel.plant_name, span: true },
    { label: 'Requested By',    value: sel.requested_by },
    { label: 'Type',            value: sel.outage_type },
    { label: 'Requested Start', value: sel.requested_start, mono: true },
    { label: 'Approved Start',  value: sel.approved_start ?? '—', mono: true },
    { label: 'Duration (hours)',value: sel.duration_hours != null ? String(sel.duration_hours) : '—', mono: true },
    { label: 'Status',          value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
  ] : [];

  const actions: DrawerAction[] = sel ? [
    {
      id: 'approve',
      label: 'Approve Outage',
      icon: 'approve',
      variant: 'primary' as const,
      onClick: async () => {
        await apexClient.grid.approveOutage(sel.id);
        setDrawerOpen(false);
      },
    },
    {
      id: 'reject',
      label: 'Reject',
      icon: 'reject',
      variant: 'danger' as const,
      onClick: async () => {
        await apexClient.grid.cancelOutage(sel.id);
        setDrawerOpen(false);
      },
    },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Planned Outages</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W18 · NERSA Grid Code 12-state</div>
      </div>
      <DataTable<GridOutageRow>
        columns={GRID_OUTAGE_COLS}
        rows={rows}
        loading={loading}
        onRowClick={row => { setSel(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={sel ? sel.ref : ''}
        subtitle={sel ? sel.plant_name : ''}
        entityRef={sel ? sel.ref : ''}
        status={sel?.chain_status}
        statusVariant={sel ? stateVariant(sel.chain_status) : 'default'}
        fields={fields}
        actions={actions}
        onActionComplete={() => setDrawerOpen(false)}
      />
    </div>
  );
}

// ─── Workstation ──────────────────────────────────────────────────────────────

export function GridWorkstation() {
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('dashboard');

  // ─── Real API data ──────────────────────────────────────────────────────────
  const { data: nominations, loading: nomLoading } = useGridNominations({ status: 'active' });
  const { data: curtailments, loading: curtLoading } = useGridCurtailments();
  const { data: connections } = useGridConnections();
  const { data: reserveActs } = useGridReserveActivations();

  // ─── Computed KPIs ──────────────────────────────────────────────────────────
  const activeCurtailments = curtailments.filter(c => c.status === 'active' || c.status === 'instructed').length;
  const totalShedMw = curtailments
    .filter(c => c.status === 'active' || c.status === 'instructed')
    .reduce((s, c) => s + (c.shed_mw || 0), 0);
  const pendingNominations = nominations.filter(n => n.status === 'submitted' || n.status === 'pending').length;
  const activeConnections = connections.filter(c => c.status === 'energised' || c.status === 'commercial_operation').length;
  const _reserveCount = reserveActs.filter(r => r.status === 'activated' || r.status === 'standing_by').length;

  const SCREEN_TO_NAV: Record<ActiveScreen, string> = {
    dashboard:   'grid-dashboard',
    analytics:   'grid-analytics',
    nominations: 'grid-noms',
    curtailments:'grid-curtail',
    connections: 'grid-energize',
    reserve:     'grid-reserve',
    gca:         'grid-gca',
    wheeling:    'grid-wheeling',
    compliance:  'grid-code-comp',
    capacity:    'grid-capacity',
    outage:      'grid-outage',
  };

  const liveNavConfig = {
    ...GRID_NAV,
    activeId: SCREEN_TO_NAV[activeScreen],
    sections: GRID_NAV.sections.map(section => ({
      ...section,
      items: section.items.map(item => ({
        ...item,
        onClick:
          item.id === 'grid-analytics'  ? () => setActiveScreen('analytics')
        : item.id === 'grid-dashboard'  ? () => setActiveScreen('dashboard')
        : item.id === 'grid-noms'       ? () => setActiveScreen('nominations')
        : item.id === 'grid-curtail'    ? () => setActiveScreen('curtailments')
        : item.id === 'grid-energize'   ? () => setActiveScreen('connections')
        : item.id === 'grid-cap-alloc'  ? () => setActiveScreen('connections')
        : item.id === 'grid-capacity'   ? () => setActiveScreen('capacity')
        : item.id === 'grid-reserve'    ? () => setActiveScreen('reserve')
        : item.id === 'grid-ancillary'  ? () => setActiveScreen('reserve')
        : item.id === 'grid-gca'        ? () => setActiveScreen('gca')
        : item.id === 'grid-outage'     ? () => setActiveScreen('outage')
        : item.id === 'grid-wheeling'   ? () => setActiveScreen('wheeling')
        : item.id === 'grid-code-comp'  ? () => setActiveScreen('compliance')
        : undefined,
      })),
    })),
  };

  const twoCol: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 320px',
    gap: '16px',
    alignItems: 'start',
  };

  const leftCol: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  };

  const rightCol: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  };

  const card: React.CSSProperties = {
    background: 'var(--oe-canvas)',
    border: '1px solid var(--oe-border)',
    borderRadius: 'var(--oe-r-card)',
    boxShadow: 'var(--oe-shadow-card)',
    padding: '16px',
  };

  const breadcrumbLabel =
    activeScreen === 'analytics'    ? 'Analytics & Reports'
    : activeScreen === 'nominations'  ? 'Dispatch Nominations'
    : activeScreen === 'curtailments' ? 'Load Curtailment Orders'
    : activeScreen === 'connections'  ? 'Grid Connections'
    : activeScreen === 'reserve'      ? 'Reserve Activations'
    : activeScreen === 'gca'          ? 'Grid Connection Agreements'
    : activeScreen === 'wheeling'     ? 'Wheeling Charges'
    : activeScreen === 'compliance'   ? 'Grid Code Compliance'
    : activeScreen === 'capacity'     ? 'Grid Capacity Allocation'
    : activeScreen === 'outage'       ? 'Planned Outages'
    : 'Dashboard';

  return (
    <AppShell
      role="grid_operator"
      userName="Eng. T. Ndaba"
      userEmail="grid@openenergy.co.za"
      navConfig={liveNavConfig}
      breadcrumbs={[{ label: 'Grid Operator' }, { label: breadcrumbLabel }]}
      pageTitle="Grid Operations"
      alerts={[
        {
          id: 'curtail-active',
          variant: 'rose' as const,
          message: 'Stage 2 load shedding active — 4 curtailment orders in effect. Evening peak forecast elevated.',
          dismissible: true,
        },
      ]}
    >
      {activeScreen === 'analytics'    ? <GridAnalytics />
       : activeScreen === 'nominations'  ? <NominationsScreen />
       : activeScreen === 'curtailments' ? <CurtailmentsScreen />
       : activeScreen === 'connections'  ? <ConnectionsScreen />
       : activeScreen === 'reserve'      ? <ReserveScreen />
       : activeScreen === 'gca'          ? <GcaScreen />
       : activeScreen === 'wheeling'     ? <WheelingScreen />
       : activeScreen === 'compliance'   ? <ComplianceScreen />
       : activeScreen === 'capacity'     ? <CapacityScreen />
       : activeScreen === 'outage'       ? <OutageScreen />
       : <>{/* Page title block */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--oe-text-1)', letterSpacing: '-0.02em' }}>
          Grid Operations
        </div>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)', marginTop: '3px' }}>
          {curtLoading ? 'Loading…' : `${activeCurtailments} active curtailment${activeCurtailments !== 1 ? 's' : ''}`}
          {' · '}
          {nomLoading ? '…' : `${pendingNominations} nominations pending`}
          {' · '}
          {activeConnections > 0 ? `${activeConnections} energised connections` : 'SOC status: Normal'}
        </div>
      </div>

      {/* KPI row */}
      <StatGrid cols={4}>
        <StatCard
          label="Grid Frequency"
          value="50.02"
          unit="Hz"
          delta="Normal"
          positive
          icon="lightning"
          variant="green"
        />
        <StatCard
          label="Active Curtailments"
          value={curtLoading ? '—' : String(activeCurtailments)}
          subtext={curtLoading ? 'Loading…' : `${totalShedMw.toFixed(0)} MW shed`}
          icon="alert-triangle"
          variant="rose"
        />
        <StatCard
          label="Pending Nominations"
          value={nomLoading ? '—' : String(pendingNominations)}
          delta={nomLoading ? undefined : `${nominations.length} total`}
          icon="hierarchy"
          variant="amber"
        />
        <StatCard
          label="Reserve Margin"
          value="18.4"
          unit="%"
          delta="+2.1%"
          positive
          icon="bar-chart"
          variant="blue"
        />
      </StatGrid>

      {/* Two-column body */}
      <div style={{ ...twoCol, marginTop: '20px' }}>
        {/* Left column */}
        <div style={leftCol}>

          {/* Nominations table */}
          <div>
            <SectionHeader
              title="Dispatch Nominations"
              subtitle={nomLoading ? 'Loading…' : `${nominations.length} nomination${nominations.length !== 1 ? 's' : ''} · ${pendingNominations} pending confirmation`}
            />
            <DataTable<GridNomination>
              columns={NOM_COLS}
              rows={nominations}
              loading={nomLoading}
              compact
            />
          </div>

          {/* Curtailment table */}
          <div>
            <SectionHeader
              title="Load Curtailment Orders"
              subtitle={curtLoading ? 'Loading…' : `${activeCurtailments} active · ${totalShedMw.toFixed(0)} MW total shed`}
            />
            <DataTable<GridCurtailment>
              columns={CURTAIL_COLS}
              rows={curtailments}
              loading={curtLoading}
              compact
            />
          </div>

          {/* State flow + timeline */}
          <div style={card}>
            <SectionHeader
              title="NOM-003 Limpopo BESS — Evening Peak"
              subtitle="W13 · Awaiting SO confirmation for 17:00–21:00 window"
            />
            <StateFlow steps={NOM_STEPS} />
            <div style={{ marginTop: '20px', borderTop: '1px solid var(--oe-border-2)', paddingTop: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                Recent Grid Events
              </div>
              <Timeline events={GRID_EVENTS} compact />
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={rightCol}>
          <AIInsightCard
            title="Dispatch Alert"
            reasoning="Day-ahead forecast model (DMO curve + weather-adjusted demand) shows 17:00–21:00 peak 6% above available dispatchable. Historical pattern: 3 of last 4 similar forecasts triggered Stage 3 when pre-curtailment was not applied."
            suggestion="Evening peak demand (17:00–21:00) forecast at 34,200 MW — 6% above available dispatchable capacity. Pre-curtail 280 MW from low-priority zones now to avoid emergency Stage 3 escalation."
            confidence="high"
          />

          <ChainMap
            chainLabel="Stage 2 — 2026-06-01"
            chainType="Load Curtailment W34"
            currentState="Active"
            links={CURTAIL_CHAIN_LINKS}
          />

          <ActionPanel
            title="Dispatch Actions"
            actions={[
              {
                id: 'confirm-nom',
                label: 'Confirm Nomination',
                icon: 'check',
                variant: 'primary',
                form: (
                  <TransitionForm
                    actionLabel="Confirm Nomination"
                    fields={[
                      {
                        key: 'mw',
                        label: 'Confirmed MW',
                        type: 'number',
                        required: true,
                        placeholder: 'e.g. 38',
                      },
                      {
                        key: 'window',
                        label: 'Dispatch Window',
                        type: 'text',
                        required: true,
                        placeholder: 'e.g. 17:00–21:00',
                      },
                    ]}
                    requireReason={false}
                    onSubmit={async (data) => {
                      const nom = nominations.find(n => n.status === 'submitted' || n.status === 'pending');
                      if (nom) await apexClient.grid.confirmNomination(nom.id, data);
                    }}
                  />
                ),
              },
              {
                id: 'curtail-order',
                label: 'Issue Curtailment Order',
                icon: 'alert-triangle',
                variant: 'danger',
                form: (
                  <TransitionForm
                    actionLabel="Issue Curtailment Order"
                    reasonCodes={[
                      { value: 'demand_spike', label: 'Demand spike — emergency' },
                      { value: 'planned',      label: 'Planned maintenance curtailment' },
                    ]}
                    confirmMessage="A curtailment order is logged in the NERSA Grid Code register and notifies all affected generators immediately."
                    onSubmit={async (_data) => {
                      await apexClient.audit.listBlocks({ entity_type: 'grid_curtailment' });
                    }}
                  />
                ),
              },
              {
                id: 'activate-reserve',
                label: 'Activate Reserve',
                icon: 'lightning',
                variant: 'secondary',
                onClick: async () => {
                  await apexClient.grid.listReserveActs({ status: 'standby' });
                },
              },
              {
                id: 'export-report',
                label: 'Export Dispatch Report',
                icon: 'export',
                variant: 'ghost',
                onClick: async () => {
                  await apexClient.audit.listBlocks({ entity_type: 'grid_nomination' });
                },
              },
            ]}
          />
        </div>
      </div></>}
    </AppShell>
  );
}

export default GridWorkstation;
