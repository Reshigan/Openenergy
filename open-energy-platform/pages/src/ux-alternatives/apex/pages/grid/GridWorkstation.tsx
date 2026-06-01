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
  useAuditBlocks, useCurrentUser,
} from '../../lib/hooks';
import {
  GridNomination, GridCurtailment, GridConnection, GridReserveActivation, AuditBlock, apexClient,
} from '../../lib/client';
import { api } from '../../../../lib/api';

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
  | 'outage'
  | 'blackstart'
  | 'rez'
  | 'imbalance'
  | 'tx-outage';

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
        { id: 'grid-tx-outage',  label: 'TX Network Outage W110',    href: '#',           icon: 'alert-triangle', badge: 1, badgeVariant: 'amber' },
        { id: 'grid-code-comp',  label: 'Grid Code Compliance W67',  href: '#code-comp',  icon: 'shield' },
        { id: 'grid-blackstart', label: 'Black Start W84',           href: '#blackstart', icon: 'bolt' },
        { id: 'grid-rez',        label: 'REZ Capacity W94',          href: '#rez',        icon: 'layers' },
      ],
    },
    {
      id: 'settlements',
      label: 'Settlements',
      items: [
        { id: 'grid-wheeling',    label: 'Wheeling Charges W8',           href: '#wheeling',    icon: 'dollar' },
        { id: 'grid-reserve',     label: 'Reserve Activation W50',        href: '#reserve',     icon: 'lightning' },
        { id: 'grid-imbalance',   label: 'Imbalance Settlement W105',     href: '#',            icon: 'bolt' },
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
      <AIInsightCard
        suggestion="BRP nomination for the 06:00 interval shows 847 MW of declared capacity but SCADA telemetry from Prieska REZ reads only 612 MW available — 235 MW overnomination. Overnomination at this level triggers CASOM penalties if not corrected by T-60min."
        reasoning="NERSA Grid Code §CC.3.2: BRP overnomination corrections must be submitted before T-60min of the trading interval. The window closes in 34 minutes."
        title="Submit Correction"
        onAccept={() => {}}
      />
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
      <AIInsightCard
        suggestion="Load-shedding Stage 4 curtailment has affected 14 grid-connected generators since 18:00. Total curtailed energy is 2,340 MWh across 6 hours — deemed energy compensation exposure is R4.2M under REIPPPP PPA deemed-energy provisions."
        reasoning="NERSA PPA §7.6: curtailment events must be logged in the dispatch control system within 2h and notified to affected generators within 4h to preserve SO indemnity against deemed-energy claims."
        title="Log Curtailment Events"
        onAccept={() => {}}
      />
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
      <AIInsightCard
        suggestion="Jeffreys Bay 2 (200 MW) GCA signed but FAT testing is 23 days behind schedule. Current forecast: first synchronisation on 14 Sep 2026 — missing the 30 Sep REIPPPP deadline by 16 days. Partial energisation of 120 MW is technically feasible if FAT waiver is granted."
        reasoning="NERSA Grid Code §C-7.4 permits partial commercial operation with SO written consent if system studies confirm N-1 compliance at the partial load level. A 120 MW partial COD preserves the commercial availability date."
        title="Request Partial COD Assessment"
        onAccept={() => {}}
      />
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
      <AIInsightCard
        suggestion="SR-2026-0041 spinning reserve dispatch (Ruacana Hydro, 180 MW) activated for 47 minutes during frequency event at 14:23. Settlement due within 24h is R890k. Current automated settlement engine shows the payment queued but not yet confirmed by the reserve provider."
        reasoning="NERSA Grid Code §CC.6.4: reserve settlement must be confirmed within 24h of the activation event. Unconfirmed settlements after 24h automatically trigger a dispute process under the balancing mechanism."
        title="Confirm Settlement"
        onAccept={() => {}}
      />
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

      <AIInsightCard
        suggestion="GCA-TX-2026-0007 (Roggeveld Phase 2, 147 MW) shows 'executed' status but the SO wayleave registration with the Deeds Office has not been completed. Connection cannot be energised without registered wayleave — energisation date risk of +45 days."
        reasoning="NERSA Grid Code §C-1.7: physical connection cannot proceed without registered servitudes. The Deeds Office registration typically takes 30-60 days and must be initiated now to maintain the Sep 2026 energisation schedule."
        title="Initiate Wayleave Registration"
        onAccept={() => {}}
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
        <AIInsightCard
          suggestion="Wheeling charge dispute WCD-2026-007 (Meridian Energy, R1.2M) has been in negotiation for 88 days. The 90-day dispute resolution deadline under §6.4 of the wheeling agreement expires on 3 Jun. After 90 days, the dispute auto-escalates to NERSA arbitration."
          reasoning="NERSA ERA §30 arbitration adds 6-12 months to resolution and requires publication of the dispute in the NERSA register — creating reputational risk for both parties."
          title="Propose Settlement"
          onAccept={() => {}}
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
        <AIInsightCard
          suggestion="3 generators have failed the Q1 2026 power quality compliance test (voltage unbalance >1.5% during peak demand). NRS 097-2-1 requires non-compliant generators to submit a remediation plan within 30 days. Deadline for 2 of the 3 is 5 Jun 2026 — 4 days away."
          reasoning="Grid Code §C-8.3: generators without a submitted remediation plan after the deadline face connection suspension. Suspension of a REIPPPP plant triggers PA force majeure provisions and bank covenant breaches."
          title="Issue Compliance Notice"
          onAccept={() => {}}
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
      <AIInsightCard
        suggestion="Prieska REZ export capacity is 94% allocated (1,128 MW of 1,200 MW headroom). Next planned network reinforcement (2028 MCEP upgrade) will add 450 MW headroom. Any new allocation above 72 MW would breach the 95% planning threshold."
        reasoning="NTCSA 2024 Capacity Rules §8.2: allocations above 95% require a network capacity adequacy study (90-day process) before approval. New applications should be held until the adequacy study completes."
        title="Commission Adequacy Study"
        onAccept={() => {}}
      />
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
      <AIInsightCard
        suggestion="Koeberg Unit 2 maintenance outage (14,400 MWh/day) coincides with a scheduled Steenbras pumped-storage maintenance window. Combined loss of 16,800 MWh/day during weekday peak (18:00-22:00) will require Stage 2 load-shedding unless Gamma Hydro can dispatch 240 MW."
        reasoning="NERSA Grid Code §CC.5: combined generation outages exceeding 15% of peak demand require a generation adequacy report to the Regulator 30 days before the outage commencement date."
        title="Submit Generation Adequacy Report"
        onAccept={() => {}}
      />
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

// ─── Black Start Capability (W84) ────────────────────────────────────────────

type BlackStartRow = {
  id: string;
  ref: string;
  provider_name: string;
  restoration_zone: string;
  capability_mw: number;
  chain_status: string;
  drill_date: string | null;
  tier: string;
};

const BLACKSTART_COLS: Column<BlackStartRow>[] = [
  { key: 'ref',              header: 'Reference',        width: '150px', mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.ref}</span>,
  },
  { key: 'provider_name',   header: 'Provider',         width: '200px',
    render: r => <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--oe-text-1)' }}>{r.provider_name}</span>,
  },
  { key: 'restoration_zone', header: 'Restoration Zone', width: '160px',
    render: r => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{r.restoration_zone}</span>,
  },
  { key: 'capability_mw',   header: 'Capability MW',    width: '110px', align: 'right', mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>{r.capability_mw.toFixed(1)}</span>,
  },
  { key: 'chain_status',    header: 'Status',           width: '130px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" />,
  },
  { key: 'drill_date',      header: 'Drill Date',       width: '110px', mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-3)' }}>{r.drill_date ?? '—'}</span>,
  },
];

function BlackStartScreen() {
  const [rows, setRows] = React.useState<BlackStartRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<BlackStartRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const fetchRows = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/black-start/chain');
      setRows((res.data?.data ?? res.data?.results ?? res.data ?? []) as BlackStartRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetchRows(); }, [fetchRows]);

  const fields: DrawerField[] = sel ? [
    { label: 'Reference',        value: sel.ref,              mono: true },
    { label: 'Provider',         value: sel.provider_name,    span: true },
    { label: 'Restoration Zone', value: sel.restoration_zone },
    { label: 'Capability MW',    value: sel.capability_mw.toFixed(1), mono: true },
    { label: 'Tier',             value: sel.tier,             mono: true },
    { label: 'Drill Date',       value: sel.drill_date ?? '—', mono: true },
    { label: 'Status',           value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
  ] : [];

  const actions: DrawerAction[] = sel ? [
    {
      id: 'schedule-drill',
      label: 'Schedule Drill',
      icon: 'calendar',
      variant: 'primary' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Schedule Black Start Drill"
          fields={[
            { key: 'drill_date', label: 'Drill Date', type: 'text', required: true, placeholder: 'e.g. 2026-07-15' },
            { key: 'drill_window', label: 'Time Window', type: 'text', required: true, placeholder: 'e.g. 08:00–12:00' },
          ]}
          requireReason={false}
          onSubmit={async () => {
            await api.post(`/api/black-start/chain/${sel.id}/transition`, { action: 'schedule_drill' });
            void fetchRows();
          }}
        />
      ),
    },
    {
      id: 'conduct-drill',
      label: 'Conduct Drill',
      icon: 'checklist',
      variant: 'primary' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Conduct Black Start Drill"
          fields={[
            { key: 'actual_mw', label: 'Actual MW Achieved', type: 'number', required: true, placeholder: 'e.g. 145' },
            { key: 'duration_min', label: 'Duration (min)', type: 'number', required: true, placeholder: 'e.g. 240' },
          ]}
          requireReason={false}
          onSubmit={async () => {
            await api.post(`/api/black-start/chain/${sel.id}/transition`, { action: 'conduct_drill' });
            void fetchRows();
          }}
        />
      ),
    },
    {
      id: 'fail-drill',
      label: 'Fail Drill',
      icon: 'alert-triangle',
      variant: 'danger' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Record Drill Failure"
          requireReason
          reasonCodes={[
            { value: 'mw_below_threshold', label: 'MW achieved below certified threshold' },
            { value: 'protection_fault',   label: 'Protection system fault during drill' },
            { value: 'comms_failure',      label: 'SCADA/comms failure during drill' },
            { value: 'time_exceeded',      label: 'Black start time exceeded limit' },
          ]}
          onSubmit={async (data) => {
            await api.post(`/api/black-start/chain/${sel.id}/transition`, { action: 'fail_drill', ...data });
            void fetchRows();
          }}
        />
      ),
    },
    {
      id: 'certify',
      label: 'Certify Capability',
      icon: 'certificate',
      variant: 'secondary' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Certify Black Start Capability"
          fields={[
            { key: 'certified_mw', label: 'Certified MW', type: 'number', required: true, placeholder: 'e.g. 150' },
            { key: 'cert_expiry',  label: 'Certification Expiry', type: 'text', required: true, placeholder: 'e.g. 2027-06-30' },
          ]}
          requireReason={false}
          onSubmit={async () => {
            await api.post(`/api/black-start/chain/${sel.id}/transition`, { action: 'certify' });
            void fetchRows();
          }}
        />
      ),
    },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Black Start Capability</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W84 · Grid restoration provider register</div>
      </div>
      <AIInsightCard
        suggestion="Gamma Hydro Unit 2 black-start capability test is overdue by 47 days (last tested 3 Apr 2026). NERSA Grid Code §C-7 mandates black-start capability tests every 6 months. Non-compliance triggers the automatic capability withdrawal process."
        reasoning="Black-start capability withdrawal from Gamma Hydro reduces system black-start margin from 340 MW to 180 MW — below the minimum 200 MW Grid Code requirement."
        title="Schedule Test"
        onAccept={() => {}}
      />
      <DataTable<BlackStartRow>
        columns={BLACKSTART_COLS}
        rows={rows}
        loading={loading}
        onRowClick={row => { setSel(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={sel ? sel.provider_name : ''}
        subtitle={sel ? `${sel.restoration_zone} · ${sel.capability_mw.toFixed(1)} MW` : ''}
        entityRef={sel ? sel.ref : ''}
        status={sel?.chain_status}
        statusVariant={sel ? stateVariant(sel.chain_status) : 'default'}
        fields={fields}
        actions={actions}
        onActionComplete={() => { void fetchRows(); setDrawerOpen(false); }}
      />
    </div>
  );
}

// ─── REZ Capacity Allocation (W94) ───────────────────────────────────────────

type RezRow = {
  id: string;
  ref: string;
  project_name: string;
  rez_zone: string;
  applied_mw: number;
  allocated_mw: number | null;
  chain_status: string;
  tier: string;
};

const REZ_COLS: Column<RezRow>[] = [
  { key: 'ref',          header: 'Reference',    width: '150px', mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.ref}</span>,
  },
  { key: 'project_name', header: 'Project',      width: '220px',
    render: r => <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--oe-text-1)' }}>{r.project_name}</span>,
  },
  { key: 'rez_zone',     header: 'REZ Zone',     width: '140px',
    render: r => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{r.rez_zone}</span>,
  },
  { key: 'applied_mw',  header: 'Applied MW',   width: '110px', align: 'right', mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>{r.applied_mw.toFixed(1)}</span>,
  },
  { key: 'allocated_mw', header: 'Allocated MW', width: '110px', align: 'right', mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: r.allocated_mw == null ? 'var(--oe-text-3)' : 'var(--oe-text-1)' }}>
        {r.allocated_mw ?? '—'}
      </span>
    ),
  },
  { key: 'chain_status', header: 'Status',       width: '130px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" />,
  },
];

function RezScreen() {
  const [rows, setRows] = React.useState<RezRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<RezRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const fetchRows = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/grid/rez-capacity/chain');
      setRows((res.data?.data ?? res.data?.results ?? res.data ?? []) as RezRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetchRows(); }, [fetchRows]);

  const fields: DrawerField[] = sel ? [
    { label: 'Reference',    value: sel.ref,              mono: true },
    { label: 'Project',      value: sel.project_name,     span: true },
    { label: 'REZ Zone',     value: sel.rez_zone },
    { label: 'Applied MW',   value: sel.applied_mw.toFixed(1), mono: true },
    { label: 'Allocated MW', value: sel.allocated_mw != null ? sel.allocated_mw.toFixed(1) : '—', mono: true },
    { label: 'Tier',         value: sel.tier,             mono: true },
    { label: 'Status',       value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
  ] : [];

  const actions: DrawerAction[] = sel ? [
    {
      id: 'evaluate',
      label: 'Begin Evaluation',
      icon: 'checklist',
      variant: 'primary' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Begin REZ Capacity Evaluation"
          fields={[
            { key: 'evaluator', label: 'Evaluator Name', type: 'text', required: true, placeholder: 'e.g. NTCSA Capacity Planning' },
            { key: 'eval_date', label: 'Evaluation Date', type: 'text', required: true, placeholder: 'e.g. 2026-06-20' },
          ]}
          requireReason={false}
          onSubmit={async () => {
            await api.post(`/api/grid/rez-capacity/chain/${sel.id}/transition`, { action: 'evaluate' });
            void fetchRows();
          }}
        />
      ),
    },
    {
      id: 'award-capacity',
      label: 'Award Capacity',
      icon: 'approve',
      variant: 'primary' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Award REZ Capacity"
          fields={[
            { key: 'allocated_mw', label: 'Allocated MW', type: 'number', required: true, placeholder: 'e.g. 80' },
            { key: 'queue_rank',   label: 'Queue Rank',   type: 'number', required: true, placeholder: 'e.g. 1' },
          ]}
          requireReason={false}
          onSubmit={async (data) => {
            await api.post(`/api/grid/rez-capacity/chain/${sel.id}/transition`, { action: 'award_capacity', ...data });
            void fetchRows();
          }}
        />
      ),
    },
    {
      id: 'reject',
      label: 'Reject Application',
      icon: 'reject',
      variant: 'danger' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Reject REZ Capacity Application"
          requireReason
          reasonCodes={[
            { value: 'capacity_exhausted',  label: 'REZ zone capacity exhausted' },
            { value: 'grid_constraint',     label: 'Network constraint — thermal limit exceeded' },
            { value: 'incomplete_docs',     label: 'Application documents incomplete' },
            { value: 'lower_queue_score',   label: 'Outranked in queue scoring' },
          ]}
          onSubmit={async (data) => {
            await api.post(`/api/grid/rez-capacity/chain/${sel.id}/transition`, { action: 'reject', ...data });
            void fetchRows();
          }}
        />
      ),
    },
    {
      id: 'forfeit-allocation',
      label: 'Forfeit Allocation',
      icon: 'alert-triangle',
      variant: 'danger' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Forfeit REZ Capacity Allocation"
          requireReason
          reasonCodes={[
            { value: 'applicant_withdrawal', label: 'Applicant voluntarily withdrew' },
            { value: 'non_payment',          label: 'Capacity reservation fee not paid' },
            { value: 'milestone_failure',    label: 'Financial close milestone not met' },
          ]}
          onSubmit={async (data) => {
            await api.post(`/api/grid/rez-capacity/chain/${sel.id}/transition`, { action: 'forfeit_allocation', ...data });
            void fetchRows();
          }}
        />
      ),
    },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>REZ Capacity Allocation</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W94 · Renewable Energy Zone capacity queue</div>
      </div>
      <AIInsightCard
        suggestion="Northern Cape REZ (Prieska) current capacity queue stands at 2,847 MW against available headroom of 1,200 MW. Garob Wind (140 MW, GCA-TX-2026-0009) is the next project in queue — approval of this allocation would consume 11.7% of remaining headroom."
        reasoning="NTCSA 2024 Capacity Rules §6.3 require headroom adequacy confirmation before any new capacity allocation. Sub-headroom approvals require Minister of Energy sign-off and a public consultation period."
        title="Review Headroom"
        onAccept={() => {}}
      />
      <DataTable<RezRow>
        columns={REZ_COLS}
        rows={rows}
        loading={loading}
        onRowClick={row => { setSel(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={sel ? sel.project_name : ''}
        subtitle={sel ? `${sel.rez_zone} · ${sel.applied_mw.toFixed(1)} MW applied` : ''}
        entityRef={sel ? sel.ref : ''}
        status={sel?.chain_status}
        statusVariant={sel ? stateVariant(sel.chain_status) : 'default'}
        fields={fields}
        actions={actions}
        onActionComplete={() => { void fetchRows(); setDrawerOpen(false); }}
      />
    </div>
  );
}

// ─── Wholesale Imbalance Settlement & MTU Pricing (W105) ─────────────────────

type ImbalanceRow = {
  id: string;
  ref: string;
  trading_interval: string;
  direction: 'long' | 'short';
  volume_mwh: number;
  mtu_price_r: number;
  settlement_zar: number;
  chain_status: string;
  tier: string;
};

const IMBALANCE_COLS: Column<ImbalanceRow>[] = [
  { key: 'ref',              header: 'Reference',         width: '150px', mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.ref}</span>,
  },
  { key: 'trading_interval', header: 'Trading Interval',  width: '160px', mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.trading_interval}</span>,
  },
  { key: 'direction',        header: 'Direction',         width: '90px',
    render: r => <StatusPill label={r.direction} variant={r.direction === 'long' ? 'green' : 'rose'} size="sm" />,
  },
  { key: 'volume_mwh',       header: 'Volume MWh',        width: '110px', align: 'right', mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>{r.volume_mwh.toFixed(2)}</span>,
  },
  { key: 'mtu_price_r',      header: 'MTU Price',         width: '130px', align: 'right', mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>{`R ${r.mtu_price_r.toFixed(2)}/MWh`}</span>,
  },
  { key: 'settlement_zar',   header: 'Settlement',        width: '110px', align: 'right', mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: 'var(--oe-green)' }}>{`R ${(r.settlement_zar / 1000).toFixed(0)}k`}</span>,
  },
  { key: 'chain_status',     header: 'Status',            width: '130px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" />,
  },
];

function ImbalanceScreen() {
  const [rows, setRows] = React.useState<ImbalanceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<ImbalanceRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const fetchRows = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/grid/imbalance-settlement/chain');
      setRows((res.data?.data ?? res.data?.results ?? res.data ?? []) as ImbalanceRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetchRows(); }, [fetchRows]);

  const fields: DrawerField[] = sel ? [
    { label: 'Reference',         value: sel.ref,                                                    mono: true },
    { label: 'Trading Interval',  value: sel.trading_interval,                                       mono: true },
    { label: 'Direction',         value: <StatusPill label={sel.direction} variant={sel.direction === 'long' ? 'green' : 'rose'} size="sm" /> },
    { label: 'Volume (MWh)',      value: sel.volume_mwh.toFixed(2),                                  mono: true },
    { label: 'MTU Price',         value: `R ${sel.mtu_price_r.toFixed(2)}/MWh`,                      mono: true },
    { label: 'Settlement (ZAR)',  value: `R ${(sel.settlement_zar / 1000).toFixed(0)}k`,             mono: true },
    { label: 'Tier',              value: sel.tier,                                                    mono: true },
    { label: 'Status',            value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
  ] : [];

  const actions: DrawerAction[] = sel ? [
    {
      id: 'confirm-position',
      label: 'Confirm Position',
      icon: 'checklist',
      variant: 'primary' as const,
      onClick: () => api.post(`/api/grid/imbalance-settlement/chain/${sel.id}/transition`, { action: 'confirm_position' }).then(() => setSel(null)),
    },
    {
      id: 'calculate-settlement',
      label: 'Calculate Settlement',
      icon: 'dollar',
      variant: 'primary' as const,
      onClick: () => api.post(`/api/grid/imbalance-settlement/chain/${sel.id}/transition`, { action: 'calculate_settlement' }).then(() => { void fetchRows(); setSel(null); }),
    },
    {
      id: 'dispute',
      label: 'Dispute',
      icon: 'alert-triangle',
      variant: 'danger' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Raise Imbalance Dispute"
          requireReason
          reasonCodes={[
            { value: 'meter_error',       label: 'Metering error — volume incorrect' },
            { value: 'mtu_price_error',   label: 'MTU price incorrect' },
            { value: 'interval_mismatch', label: 'Trading interval misclassification' },
            { value: 'direction_error',   label: 'Long/short direction error' },
          ]}
          onSubmit={async (data) => {
            await api.post(`/api/grid/imbalance-settlement/chain/${sel.id}/transition`, { action: 'dispute', ...data });
            void fetchRows();
          }}
        />
      ),
    },
    {
      id: 'settle',
      label: 'Settle',
      icon: 'approve',
      variant: 'secondary' as const,
      onClick: () => api.post(`/api/grid/imbalance-settlement/chain/${sel.id}/transition`, { action: 'settle' }).then(() => { void fetchRows(); setSel(null); }),
    },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Imbalance Settlement</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W105 · Wholesale imbalance settlement & MTU pricing</div>
      </div>
      <AIInsightCard
        suggestion="MTU pricing peaked at R1,847/MWh during the 14:00-15:00 balancing interval — 2.3× above daily VWAP. Short position of 187 MWh at Koeberg node suggests supply compression from scheduled maintenance outage."
        reasoning="High MTU imbalance price signals during scheduled outages often indicate compounding N-1 constraints. Early dispute filing locks in the pre-settlement price."
        title="File Dispute"
        onAccept={() => { /* no-op */ }}
      />
      <DataTable<ImbalanceRow>
        columns={IMBALANCE_COLS}
        rows={rows}
        loading={loading}
        onRowClick={row => { setSel(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={sel ? sel.ref : ''}
        subtitle={sel ? `${sel.trading_interval} · ${sel.direction.toUpperCase()}` : ''}
        entityRef={sel ? sel.ref : ''}
        status={sel?.chain_status}
        statusVariant={sel ? stateVariant(sel.chain_status) : 'default'}
        fields={fields}
        actions={actions}
        onActionComplete={() => { void fetchRows(); setDrawerOpen(false); }}
      />
    </div>
  );
}

// ─── TX Network Outage Coordination & N-1 Security (W110) ────────────────────

type TxOutageRow = {
  id: string;
  ref: string;
  circuit_name: string;
  voltage_kv: number;
  outage_type: string;
  n1_secure: boolean;
  planned_start: string;
  planned_end: string | null;
  chain_status: string;
  tier: string;
};

const TX_OUTAGE_COLS: Column<TxOutageRow>[] = [
  {
    key: 'ref',
    header: 'Reference',
    width: '150px',
    mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.ref}</span>
    ),
  },
  {
    key: 'circuit_name',
    header: 'Circuit',
    width: '220px',
    render: r => (
      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--oe-text-1)' }}>{r.circuit_name}</span>
    ),
  },
  {
    key: 'voltage_kv',
    header: 'Voltage',
    width: '90px',
    align: 'right',
    mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>{`${r.voltage_kv}kV`}</span>
    ),
  },
  {
    key: 'outage_type',
    header: 'Type',
    width: '120px',
    render: r => (
      <span style={{ fontSize: '11px', color: 'var(--oe-text-2)', textTransform: 'uppercase' }}>{r.outage_type}</span>
    ),
  },
  {
    key: 'n1_secure',
    header: 'N-1 Security',
    width: '110px',
    render: r => (
      <StatusPill
        label={r.n1_secure ? 'N-1 Secure' : 'N-1 Risk'}
        variant={r.n1_secure ? 'green' : 'rose'}
        size="sm"
      />
    ),
  },
  {
    key: 'chain_status',
    header: 'Status',
    width: '130px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" />,
  },
  {
    key: 'planned_start',
    header: 'Planned Start',
    width: '150px',
    mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-3)' }}>{r.planned_start}</span>
    ),
  },
];

function TxOutageScreen() {
  const [rows, setRows] = React.useState<TxOutageRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<TxOutageRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const fetchRows = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/grid/transmission-outage/chain');
      setRows((res.data?.data ?? res.data?.results ?? res.data ?? []) as TxOutageRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetchRows(); }, [fetchRows]);

  const fields: DrawerField[] = sel ? [
    { label: 'Reference',     value: sel.ref,            mono: true },
    { label: 'Circuit',       value: sel.circuit_name,   span: true },
    { label: 'Voltage (kV)',  value: `${sel.voltage_kv}kV`, mono: true },
    { label: 'Outage Type',   value: sel.outage_type },
    { label: 'N-1 Security',  value: <StatusPill label={sel.n1_secure ? 'N-1 Secure' : 'N-1 Risk'} variant={sel.n1_secure ? 'green' : 'rose'} size="sm" /> },
    { label: 'Planned Start', value: sel.planned_start,  mono: true },
    { label: 'Planned End',   value: sel.planned_end ?? '—', mono: true },
    { label: 'Tier',          value: sel.tier,           mono: true },
    { label: 'Status',        value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
  ] : [];

  const actions: DrawerAction[] = sel ? [
    {
      id: 'raise-outage',
      label: 'Raise Outage',
      icon: 'send',
      variant: 'primary' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Raise TX Network Outage"
          fields={[
            { key: 'circuit_name',  label: 'Circuit Name',     type: 'text',   required: true,  placeholder: 'e.g. Boland–Muldersvlei 400kV' },
            { key: 'voltage_kv',    label: 'Voltage (kV)',      type: 'number', required: true,  placeholder: 'e.g. 400' },
            { key: 'outage_type',   label: 'Outage Type',       type: 'text',   required: true,  placeholder: 'e.g. planned / emergency' },
            { key: 'planned_start', label: 'Planned Start',     type: 'text',   required: true,  placeholder: 'e.g. 2026-06-10T06:00' },
            { key: 'planned_end',   label: 'Planned End',       type: 'text',   required: false, placeholder: 'e.g. 2026-06-10T18:00' },
          ]}
          requireReason={false}
          onSubmit={async (data) => {
            await api.post(`/api/grid/transmission-outage/chain/${sel.id}/transition`, { action: 'raise_outage', ...data });
            void fetchRows();
          }}
        />
      ),
    },
    {
      id: 'approve-outage',
      label: 'Approve Outage',
      icon: 'approve',
      variant: 'primary' as const,
      onClick: () => api.post(`/api/grid/transmission-outage/chain/${sel.id}/transition`, { action: 'approve_outage' }).then(() => { void fetchRows(); setDrawerOpen(false); }),
    },
    {
      id: 'activate',
      label: 'Activate Outage',
      icon: 'lightning',
      variant: 'secondary' as const,
      onClick: () => api.post(`/api/grid/transmission-outage/chain/${sel.id}/transition`, { action: 'activate' }).then(() => { void fetchRows(); setDrawerOpen(false); }),
    },
    {
      id: 'restore',
      label: 'Restore Circuit',
      icon: 'check',
      variant: 'secondary' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Restore Circuit"
          fields={[
            { key: 'restored_at', label: 'Restoration Time', type: 'text', required: true, placeholder: 'e.g. 2026-06-10T17:45' },
          ]}
          requireReason={false}
          onSubmit={async (data) => {
            await api.post(`/api/grid/transmission-outage/chain/${sel.id}/transition`, { action: 'restore', ...data });
            void fetchRows();
          }}
        />
      ),
    },
    {
      id: 'force-cancel',
      label: 'Force Cancel',
      icon: 'alert-triangle',
      variant: 'danger' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Force Cancel Outage"
          requireReason
          reasonCodes={[
            { value: 'grid_emergency',    label: 'Grid emergency — circuit required immediately' },
            { value: 'n1_violation',      label: 'N-1 security violation detected' },
            { value: 'approval_lapsed',   label: 'Approval window lapsed' },
            { value: 'contractor_cancel', label: 'Contractor cancelled' },
          ]}
          onSubmit={async (data) => {
            await api.post(`/api/grid/transmission-outage/chain/${sel.id}/transition`, { action: 'force_cancel', ...data });
            void fetchRows();
          }}
        />
      ),
    },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>TX Network Outage Coordination</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W110 · Transmission network outage & N-1 security</div>
      </div>
      <AIInsightCard
        suggestion="Planned Grassridge-Aranos 400kV outage scheduled 09:00-16:00 on 3 Jun reduces N-1 security margin to 11% at Koeberg MTS. Two concurrent forced outages in the same corridor would trigger load shedding Stage 2."
        reasoning="NERSA Grid Code §CC.5 requires SO notification 72h before any outage reducing N-1 margin below 15%."
        title="Review N-1 Assessment"
        onAccept={() => { /* no-op */ }}
      />
      <DataTable<TxOutageRow>
        columns={TX_OUTAGE_COLS}
        rows={rows}
        loading={loading}
        onRowClick={row => { setSel(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={sel ? sel.circuit_name : ''}
        subtitle={sel ? `${sel.voltage_kv}kV · ${sel.outage_type}` : ''}
        entityRef={sel ? sel.ref : ''}
        status={sel?.chain_status}
        statusVariant={sel ? stateVariant(sel.chain_status) : 'default'}
        fields={fields}
        actions={actions}
        onActionComplete={() => { void fetchRows(); setDrawerOpen(false); }}
      />
    </div>
  );
}

// ─── Workstation ──────────────────────────────────────────────────────────────

export function GridWorkstation() {
  const { data: me } = useCurrentUser();
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
    blackstart:  'grid-blackstart',
    rez:         'grid-rez',
    imbalance:   'grid-imbalance',
    'tx-outage': 'grid-tx-outage',
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
        : item.id === 'grid-blackstart' ? () => setActiveScreen('blackstart')
        : item.id === 'grid-rez'        ? () => setActiveScreen('rez')
        : item.id === 'grid-imbalance'  ? () => setActiveScreen('imbalance')
        : item.id === 'grid-tx-outage'  ? () => setActiveScreen('tx-outage')
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
    : activeScreen === 'blackstart'   ? 'Black Start Capability'
    : activeScreen === 'rez'          ? 'REZ Capacity Allocation'
    : activeScreen === 'imbalance'    ? 'Imbalance Settlement'
    : activeScreen === 'tx-outage'    ? 'TX Network Outage Coordination'
    : 'Dashboard';

  return (
    <AppShell
      role="grid_operator"
      userName={me?.name ?? 'User'}
      userEmail={me?.email ?? ''}
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
       : activeScreen === 'blackstart'   ? <BlackStartScreen />
       : activeScreen === 'rez'          ? <RezScreen />
       : activeScreen === 'imbalance'    ? <ImbalanceScreen />
       : activeScreen === 'tx-outage'    ? <TxOutageScreen />
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
