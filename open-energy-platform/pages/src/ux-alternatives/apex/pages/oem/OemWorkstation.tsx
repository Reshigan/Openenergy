/**
 * OEM Support Workstation — Apex design
 * ITIL full chain family: Incident / Problem / Change / Security + Warranty + Spares
 */

import React, { useState } from 'react';
import { OemAnalytics } from '../analytics/OemAnalytics';
import { AppShell, NavConfig } from '../../components/shell/AppShell';
import { StatCard, StatGrid } from '../../components/display/StatCard';
import { DataTable, Column } from '../../components/display/DataTable';
import { StatusPill, stateVariant } from '../../components/display/StatusPill';
import { AIInsightCard } from '../../components/display/AIInsightCard';
import { ChainMap, ChainLink } from '../../components/display/ChainMap';
import { ActionPanel } from '../../components/actions/ActionPanel';
import { TransitionForm } from '../../components/actions/TransitionForm';
import { StateFlow, StateFlowStep } from '../../components/display/StateFlow';
import { DetailDrawer, DrawerField, DrawerAction } from '../../components/display/DetailDrawer';
import {
  useOemTickets,
  useOemSpareParts,
  useOemWarrantyRecovery,
  useAuditBlocks,
} from '../../lib/hooks';
import { OemTicket, OemSparePart, OemWarrantyRecovery, AuditBlock, apexClient } from '../../lib/client';

// ─── Nav config ───────────────────────────────────────────────────────────────

const OEM_NAV: NavConfig = {
  activeId: 'oem-dashboard',
  sections: [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { id: 'oem-dashboard', label: 'Dashboard',    href: '#dashboard', icon: 'home' },
        { id: 'oem-queue',     label: 'Ticket Queue', href: '#queue',     icon: 'list', badge: 5, badgeVariant: 'rose' },
        { id: 'oem-analytics', label: 'Analytics',    href: '#analytics', icon: 'chart-line' },
      ],
    },
    {
      id: 'itil',
      label: 'ITIL Chains',
      items: [
        { id: 'oem-incident',  label: 'Incident W14',             href: '#incident',  icon: 'alert-triangle', badge: 3, badgeVariant: 'rose' },
        { id: 'oem-problem',   label: 'Problem Mgmt W41',         href: '#problem',   icon: 'hierarchy' },
        { id: 'oem-change',    label: 'Change Enablement W47',    href: '#change',    icon: 'checklist', badge: 1, badgeVariant: 'amber' },
        { id: 'oem-security',  label: 'Security Remediation W55', href: '#security',  icon: 'lock', badge: 2, badgeVariant: 'rose' },
      ],
    },
    {
      id: 'warranty',
      label: 'Warranty',
      items: [
        { id: 'oem-warranty-claim',    label: 'Warranty Claim W15',    href: '#warranty',       icon: 'certificate', badge: 1, badgeVariant: 'amber' },
        { id: 'oem-warranty-recovery', label: 'Warranty Recovery W63', href: '#warranty-rec',   icon: 'dollar' },
        { id: 'oem-fco',               label: 'FCO / Field Change',    href: '#fco',            icon: 'wrench' },
      ],
    },
    {
      id: 'parts',
      label: 'Parts & Spares',
      items: [
        { id: 'oem-spares',    label: 'Spare Parts W72',    href: '#spares',   icon: 'folder' },
        { id: 'oem-firmware',  label: 'Firmware Patches W55', href: '#firmware', icon: 'gear' },
      ],
    },
    {
      id: 'reports',
      label: 'Reports',
      defaultCollapsed: true,
      items: [
        { id: 'oem-rpt-sla',      label: 'SLA Report',       href: '#rpt-sla',       icon: 'report' },
        { id: 'oem-rpt-incident', label: 'Incident Register', href: '#rpt-incident',  icon: 'list' },
        { id: 'oem-rpt-change',   label: 'Change Log',        href: '#rpt-change',    icon: 'checklist' },
        { id: 'oem-settings',     label: 'Settings',          href: '#settings',      icon: 'gear' },
      ],
    },
  ],
};

// ─── Static chart / flow data (unchanged) ─────────────────────────────────────

const INC_STEPS: StateFlowStep[] = [
  { id: 'reported',  label: 'Reported',  status: 'complete', timestamp: '08:14' },
  { id: 'triaged',   label: 'Triaged',   status: 'complete', timestamp: '08:22' },
  { id: 'diagnosed', label: 'Diagnosed', status: 'current',  sublabel: 'BESS thermal runaway — isolating' },
  { id: 'escalated', label: 'Escalated', status: 'pending' },
  { id: 'resolved',  label: 'Resolved',  status: 'pending' },
  { id: 'closed',    label: 'Closed',    status: 'pending' },
];

const INC_CHAIN_LINKS: ChainLink[] = [
  { id: 'cl1', label: 'PRB-019 BESS Thermal Recurrence', chainType: 'Problem Mgmt W41',  state: 'draft',       role: 'O&M Support', relationship: 'child' },
  { id: 'cl2', label: 'WO-023 Isolation',                chainType: 'Work Order W16',     state: 'in_progress', role: 'O&M Support', relationship: 'peer' },
  { id: 'cl3', label: 'PTW-2026-0089',                   chainType: 'Permit to Work W64', state: 'pending',     role: 'O&M Support', relationship: 'cross-role' },
];

// ─── SLA Burn Rate component ──────────────────────────────────────────────────

interface SlaBurnItem {
  ticket: string;
  pct: number;
  remaining: string;
}

const SLA_DATA: SlaBurnItem[] = [
  { ticket: 'INC-004', pct: 89, remaining: '38m' },
  { ticket: 'INC-003', pct: 85, remaining: '44m' },
  { ticket: 'INC-001', pct: 42, remaining: '2h 14m' },
  { ticket: 'INC-002', pct: 20, remaining: '8h' },
];

function slaBurnColor(pct: number): string {
  if (pct > 80) return 'var(--oe-rose)';
  if (pct > 50) return 'var(--oe-amber)';
  return 'var(--oe-green)';
}

function SlaBurnRate(): React.ReactElement {
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
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid var(--oe-border-2)',
          background: 'var(--oe-surf)',
          fontSize: '11px',
          fontWeight: 700,
          color: 'var(--oe-text-2)',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.05em',
        }}
      >
        SLA Burn Rate
      </div>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {SLA_DATA.map((item) => {
          const color = slaBurnColor(item.pct);
          return (
            <div key={item.ticket}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '4px',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    fontFamily: '"JetBrains Mono", monospace',
                    color: 'var(--oe-text-2)',
                  }}
                >
                  {item.ticket}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color,
                    fontFamily: '"JetBrains Mono", monospace',
                  }}
                >
                  {item.remaining}
                </span>
              </div>
              <div
                style={{
                  height: '6px',
                  borderRadius: '3px',
                  background: 'var(--oe-surf-2)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${item.pct}%`,
                    background: color,
                    borderRadius: '3px',
                    transition: 'width 400ms var(--oe-ease)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section card helper ──────────────────────────────────────────────────────

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
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
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid var(--oe-border-2)',
          background: 'var(--oe-surf)',
          fontSize: '11px',
          fontWeight: 700,
          color: 'var(--oe-text-2)',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.05em',
        }}
      >
        {title}
      </div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </div>
  );
}

// ─── Ticket column helpers ────────────────────────────────────────────────────

function TicketPriorityCell({ priority }: { priority: string }): React.ReactElement {
  let color = 'var(--oe-text-2)';
  let fontWeight: React.CSSProperties['fontWeight'] = 500;

  if (priority === 'P1' || priority === 'critical') {
    color = 'var(--oe-rose)';
    fontWeight = 700;
  } else if (priority === 'P2') {
    color = 'var(--oe-amber)';
    fontWeight = 600;
  }

  return (
    <span
      style={{
        fontSize: '12px',
        fontWeight,
        color,
        fontFamily: '"JetBrains Mono", monospace',
      }}
    >
      {priority}
    </span>
  );
}

function HoursRemainingCell({ hours }: { hours?: number }): React.ReactElement {
  if (hours == null) {
    return (
      <span style={{ fontSize: '12px', color: 'var(--oe-text-3)', fontFamily: '"JetBrains Mono", monospace' }}>
        —
      </span>
    );
  }
  let color = 'var(--oe-green)';
  let fontWeight: React.CSSProperties['fontWeight'] = 500;
  if (hours < 4) {
    color = 'var(--oe-rose)';
    fontWeight = 700;
  } else if (hours < 24) {
    color = 'var(--oe-amber)';
    fontWeight = 600;
  }
  return (
    <span style={{ fontSize: '12px', fontWeight, color, fontFamily: '"JetBrains Mono", monospace' }}>
      {hours.toFixed(1)}h
    </span>
  );
}

// ─── Ticket DataTable columns ─────────────────────────────────────────────────

const TICKET_COLUMNS: Column<OemTicket>[] = [
  { key: 'id',          header: 'ID',       mono: true, width: '80px',  render: (row) => <span style={{ fontSize: '11px', fontFamily: '"JetBrains Mono", monospace', color: 'var(--oe-text-2)' }}>{row.ticket_ref ?? row.id}</span> },
  { key: 'ticket_ref',  header: 'Ref',      mono: true, width: '90px' },
  { key: 'asset_name',  header: 'Asset',    width: '160px', render: (row) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{row.asset_name ?? '—'}</span> },
  {
    key: 'priority',
    header: 'P',
    width: '44px',
    render: (row) => <TicketPriorityCell priority={row.priority} />,
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <StatusPill label={row.status} variant={stateVariant(row.status)} size="xs" />
    ),
  },
  {
    key: 'category',
    header: 'Category',
    width: '110px',
    render: (row) => (
      <span style={{ fontSize: '11px', color: 'var(--oe-text-3)', textTransform: 'capitalize' }}>
        {row.category}
      </span>
    ),
  },
  {
    key: 'hours_remaining',
    header: 'SLA',
    align: 'right',
    render: (row) => <HoursRemainingCell hours={row.hours_remaining} />,
  },
];

// ─── Spare parts column helpers ───────────────────────────────────────────────

function VedClassCell({ ved }: { ved: string }): React.ReactElement {
  let color = 'var(--oe-text-2)';
  let fontWeight: React.CSSProperties['fontWeight'] = 500;

  if (ved === 'Vital' || ved === 'V') {
    color = 'var(--oe-rose)';
    fontWeight = 700;
  } else if (ved === 'Essential' || ved === 'E') {
    color = 'var(--oe-amber)';
    fontWeight = 600;
  }

  return (
    <span style={{ fontSize: '12px', fontWeight, color, fontFamily: '"JetBrains Mono", monospace' }}>
      {ved.charAt(0)}
    </span>
  );
}

function StockQtyCell({ qty, minStock }: { qty: number; minStock: number }): React.ReactElement {
  const isLow = qty <= minStock;
  return (
    <span
      style={{
        fontSize: '12px',
        fontWeight: isLow ? 700 : 500,
        color: isLow ? 'var(--oe-rose)' : 'var(--oe-text-2)',
        fontFamily: '"JetBrains Mono", monospace',
      }}
    >
      {qty}
    </span>
  );
}

// ─── Spare parts DataTable columns ───────────────────────────────────────────

const SPARE_PARTS_COLUMNS: Column<OemSparePart>[] = [
  { key: 'part_number',  header: 'Part No.',   mono: true, width: '110px' },
  { key: 'description',  header: 'Description', width: '200px', render: (row) => <span style={{ fontSize: '12px', color: 'var(--oe-text-1)' }}>{row.description}</span> },
  {
    key: 'ved_class',
    header: 'VED',
    width: '50px',
    render: (row) => <VedClassCell ved={row.ved_class} />,
  },
  {
    key: 'on_hand',
    header: 'Stock',
    align: 'right',
    width: '70px',
    render: (row) => <StockQtyCell qty={row.on_hand} minStock={row.min_stock} />,
  },
  {
    key: 'min_stock',
    header: 'Reorder Pt',
    align: 'right',
    width: '90px',
    render: (row) => (
      <span style={{ fontSize: '12px', color: 'var(--oe-text-3)', fontFamily: '"JetBrains Mono", monospace' }}>
        {row.min_stock}
      </span>
    ),
  },
  {
    key: 'lead_time_days',
    header: 'Lead',
    align: 'right',
    width: '60px',
    render: (row) => (
      <span style={{ fontSize: '12px', color: 'var(--oe-text-3)', fontFamily: '"JetBrains Mono", monospace' }}>
        {row.lead_time_days}d
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} size="xs" />,
  },
];

// ─── Spare parts full-screen columns (includes reserved/available) ────────────

const SPARE_PARTS_SCREEN_COLS: Column<OemSparePart>[] = [
  { key: 'part_number',   header: 'Part No.',    mono: true, width: '110px' },
  { key: 'description',   header: 'Description', width: '180px', render: (row) => <span style={{ fontSize: '12px', color: 'var(--oe-text-1)' }}>{row.description}</span> },
  { key: 'ved_class',     header: 'VED',  width: '50px',  render: (row) => <VedClassCell ved={row.ved_class} /> },
  { key: 'on_hand',       header: 'Stock', align: 'right', width: '70px', render: (row) => <StockQtyCell qty={row.on_hand} minStock={row.min_stock} /> },
  { key: 'reserved',      header: 'Reserved', align: 'right', width: '80px', render: (row) => <span style={{ fontSize: '12px', color: 'var(--oe-text-3)', fontFamily: '"JetBrains Mono", monospace' }}>{row.reserved}</span> },
  { key: 'available',     header: 'Available', align: 'right', width: '80px', render: (row) => <span style={{ fontSize: '12px', fontWeight: row.available <= 0 ? 700 : 500, color: row.available <= 0 ? 'var(--oe-rose)' : 'var(--oe-text-2)', fontFamily: '"JetBrains Mono", monospace' }}>{row.available}</span> },
  { key: 'min_stock',     header: 'Reorder Pt', align: 'right', width: '90px', render: (row) => <span style={{ fontSize: '12px', color: 'var(--oe-text-3)', fontFamily: '"JetBrains Mono", monospace' }}>{row.min_stock}</span> },
  { key: 'lead_time_days',header: 'Lead', align: 'right', width: '60px', render: (row) => <span style={{ fontSize: '12px', color: 'var(--oe-text-3)', fontFamily: '"JetBrains Mono", monospace' }}>{row.lead_time_days}d</span> },
  { key: 'status',        header: 'Status', render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} size="xs" /> },
];

// ─── Tickets screen columns (full list, used in TicketsScreen) ────────────────

const TICKETS_SCREEN_COLS: Column<OemTicket>[] = [
  { key: 'ticket_ref',  header: 'Ref',      mono: true, width: '100px' },
  { key: 'asset_name',  header: 'Asset',    width: '160px', render: (row) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{row.asset_name ?? '—'}</span> },
  { key: 'priority',    header: 'Priority', width: '70px',  render: (row) => <TicketPriorityCell priority={row.priority} /> },
  { key: 'category',    header: 'Category', width: '120px', render: (row) => <span style={{ fontSize: '11px', color: 'var(--oe-text-3)', textTransform: 'capitalize' }}>{row.category}</span> },
  { key: 'status',      header: 'Status',   render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} size="xs" /> },
  { key: 'hours_remaining', header: 'Hours Rem.', align: 'right', render: (row) => <HoursRemainingCell hours={row.hours_remaining} /> },
  { key: 'sla_deadline', header: 'SLA Deadline', width: '140px', render: (row) => <span style={{ fontSize: '11px', color: 'var(--oe-text-3)', fontFamily: '"JetBrains Mono", monospace' }}>{row.sla_deadline ?? '—'}</span> },
];

// ─── Audit table columns (shared for Problems / Changes / Security / Firmware) ──

const AUDIT_COLS: Column<AuditBlock>[] = [
  { key: 'id',          header: 'Ref',    mono: true, width: '90px', render: (row) => <span style={{ fontSize: '11px', fontFamily: '"JetBrains Mono", monospace', color: 'var(--oe-text-3)' }}>{row.id.slice(-8)}</span> },
  { key: 'action',      header: 'Action', width: '180px', render: (row) => <span style={{ fontSize: '12px', fontFamily: '"JetBrains Mono", monospace', color: 'var(--oe-text-2)' }}>{row.action}</span> },
  { key: 'actor_name',  header: 'Actor',  width: '160px', render: (row) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{row.actor_name ?? row.actor_id}</span> },
  { key: 'timestamp',   header: 'Date',   render: (row) => <span style={{ fontSize: '11px', color: 'var(--oe-text-3)', fontFamily: '"JetBrains Mono", monospace' }}>{row.timestamp}</span> },
];

// ─── Warranty recovery screen columns ────────────────────────────────────────

const WARRANTY_RECOVERY_COLS: Column<OemWarrantyRecovery>[] = [
  { key: 'claim_ref',         header: 'Ref',         mono: true, width: '100px' },
  { key: 'defect_class',      header: 'Defect Class', width: '120px', render: (row) => <span style={{ fontSize: '11px', color: 'var(--oe-text-3)', textTransform: 'capitalize' }}>{row.defect_class}</span> },
  { key: 'oem_name',          header: 'OEM',          width: '140px', render: (row) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{row.oem_name}</span> },
  { key: 'failed_component',  header: 'Component',    width: '160px', render: (row) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{row.failed_component}</span> },
  { key: 'claimed_zar',       header: 'Claimed',      align: 'right', width: '90px', render: (row) => <span style={{ fontSize: '12px', fontFamily: '"JetBrains Mono", monospace', color: 'var(--oe-text-2)' }}>{'R' + (row.claimed_zar / 1e6).toFixed(1) + 'M'}</span> },
  { key: 'recovery_rate_pct', header: 'Recovery %',   align: 'right', width: '90px', render: (row) => <span style={{ fontSize: '12px', fontFamily: '"JetBrains Mono", monospace', color: 'var(--oe-text-2)' }}>{row.recovery_rate_pct != null ? row.recovery_rate_pct.toFixed(1) + '%' : '—'}</span> },
  { key: 'status',            header: 'Status',        render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} size="xs" /> },
  { key: 'eta',               header: 'ETA',           width: '110px', render: (row) => <span style={{ fontSize: '11px', color: 'var(--oe-text-3)', fontFamily: '"JetBrains Mono", monospace' }}>{row.eta ?? '—'}</span> },
];

// ─── Sub-screen components ────────────────────────────────────────────────────

function TicketsScreen(): React.ReactElement {
  const { data, loading, refetch } = useOemTickets();
  const [selected, setSelected] = React.useState<OemTicket | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const ticketFields: DrawerField[] = selected
    ? [
        { label: 'Ticket Ref', value: selected.ticket_ref, mono: true },
        { label: 'Priority',   value: selected.priority,   mono: true },
        { label: 'Status',     value: <StatusPill label={selected.status} variant={stateVariant(selected.status)} size="sm" /> },
        { label: 'Category',   value: selected.category },
        { label: 'Asset',      value: selected.asset_name ?? '—' },
        { label: 'Asset ID',   value: selected.asset_id ?? '—', mono: true },
        { label: 'Assignee',   value: selected.assignee ?? '—' },
        { label: 'SLA Deadline', value: selected.sla_deadline ?? '—', mono: true },
        { label: 'Hours Remaining', value: selected.hours_remaining != null ? `${selected.hours_remaining.toFixed(1)}h` : '—', mono: true },
        { label: 'Created',    value: selected.created_at, mono: true },
      ]
    : [];

  const ticketActions: DrawerAction[] = selected
    ? [
        {
          id: 'escalate',
          label: 'Escalate Ticket',
          icon: 'alert-triangle',
          variant: 'primary',
          disabled: selected.status === 'closed' || selected.status === 'resolved',
          disabledReason: 'Ticket is already closed or resolved',
          onClick: async () => {
            await apexClient.oem.escalateTicket(selected.id, { reason: 'manual_escalation' });
          },
        },
        {
          id: 'view-audit',
          label: 'Refresh Audit Trail',
          icon: 'list',
          variant: 'secondary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'support_ticket', entity_id: selected.id });
          },
        },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Ticket Queue</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading...' : data.length + ' records'}</div>
      </div>
      <DataTable<OemTicket>
        columns={TICKETS_SCREEN_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.ticket_ref ?? 'Ticket Detail'}
        subtitle={selected ? `${selected.asset_name ?? 'No asset'} — ${selected.category}` : undefined}
        entityRef={selected?.id.slice(-8)}
        status={selected?.status}
        fields={ticketFields}
        actions={ticketActions}
        onActionComplete={() => refetch()}
      />
    </div>
  );
}

function ProblemsScreen(): React.ReactElement {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'problem_record' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const auditFields: DrawerField[] = selected
    ? [
        { label: 'Block ID',     value: selected.id,          mono: true },
        { label: 'Seq',          value: String(selected.seq),  mono: true },
        { label: 'Entity Type',  value: selected.entity_type },
        { label: 'Entity ID',    value: selected.entity_id,   mono: true },
        { label: 'Action',       value: selected.action,      mono: true },
        { label: 'Actor',        value: selected.actor_name ?? selected.actor_id },
        { label: 'Actor Role',   value: selected.actor_role ?? '—' },
        { label: 'Timestamp',    value: selected.timestamp,   mono: true },
        { label: 'Hash',         value: selected.hash.slice(0, 16) + '...', mono: true, span: true },
      ]
    : [];

  const auditActions: DrawerAction[] = selected
    ? [
        {
          id: 'raise-problem',
          label: 'Initiate Problem Record',
          icon: 'hierarchy',
          variant: 'primary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'problem_record', entity_id: selected.entity_id });
          },
        },
        {
          id: 'refresh',
          label: 'Refresh Audit Chain',
          icon: 'list',
          variant: 'secondary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'problem_record' });
          },
        },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Problem Management</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading...' : data.length + ' records'}</div>
      </div>
      <ActionPanel
        title="Problem Actions"
        actions={[
          {
            id: 'initiate-problem',
            label: 'Initiate Problem Record',
            icon: 'hierarchy',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Initiate Problem Record"
                requireReason={false}
                fields={[
                  { key: 'root_cause_hypothesis', label: 'Root Cause Hypothesis', type: 'textarea', required: true },
                  { key: 'linked_incident_ref',   label: 'Linked Incident Ref',   type: 'text',     required: false },
                ]}
                onSubmit={async (data) => {
                  await apexClient.audit.listBlocks({ entity_type: 'problem_record', ...data });
                  refetch();
                }}
              />
            ),
          },
        ]}
      />
      <DataTable<AuditBlock>
        columns={AUDIT_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `Problem: ${selected.action}` : 'Problem Detail'}
        subtitle={selected ? `Entity: ${selected.entity_id}` : undefined}
        entityRef={selected?.id.slice(-8)}
        fields={auditFields}
        actions={auditActions}
        onActionComplete={() => refetch()}
      />
    </div>
  );
}

function ChangesScreen(): React.ReactElement {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'rfc' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const auditFields: DrawerField[] = selected
    ? [
        { label: 'Block ID',     value: selected.id,          mono: true },
        { label: 'Seq',          value: String(selected.seq),  mono: true },
        { label: 'Entity Type',  value: selected.entity_type },
        { label: 'Entity ID',    value: selected.entity_id,   mono: true },
        { label: 'Action',       value: selected.action,      mono: true },
        { label: 'Actor',        value: selected.actor_name ?? selected.actor_id },
        { label: 'Actor Role',   value: selected.actor_role ?? '—' },
        { label: 'Timestamp',    value: selected.timestamp,   mono: true },
        { label: 'Hash',         value: selected.hash.slice(0, 16) + '...', mono: true, span: true },
      ]
    : [];

  const auditActions: DrawerAction[] = selected
    ? [
        {
          id: 'raise-rfc',
          label: 'Raise RFC Against This Record',
          icon: 'checklist',
          variant: 'primary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'rfc', entity_id: selected.entity_id });
          },
        },
        {
          id: 'refresh',
          label: 'Refresh Change Log',
          icon: 'list',
          variant: 'secondary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'rfc' });
          },
        },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Change Enablement</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading...' : data.length + ' records'}</div>
      </div>
      <ActionPanel
        title="Change Actions"
        actions={[
          {
            id: 'raise-rfc',
            label: 'Raise RFC / Change Request',
            icon: 'checklist',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Raise RFC"
                requireReason={false}
                fields={[
                  { key: 'change_title',         label: 'Change Title',    type: 'text',     required: true },
                  { key: 'change_justification', label: 'Justification',   type: 'textarea', required: false },
                  { key: 'change_type',          label: 'Change Type',     type: 'text',     required: false },
                ]}
                onSubmit={async (data) => {
                  await apexClient.audit.listBlocks({ entity_type: 'rfc', ...data });
                  refetch();
                }}
              />
            ),
          },
        ]}
      />
      <DataTable<AuditBlock>
        columns={AUDIT_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `RFC: ${selected.action}` : 'Change Detail'}
        subtitle={selected ? `Entity: ${selected.entity_id}` : undefined}
        entityRef={selected?.id.slice(-8)}
        fields={auditFields}
        actions={auditActions}
        onActionComplete={() => refetch()}
      />
    </div>
  );
}

function SparePartsScreen(): React.ReactElement {
  const { data, loading, refetch } = useOemSpareParts();
  const [selected, setSelected] = React.useState<OemSparePart | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const spareFields: DrawerField[] = selected
    ? [
        { label: 'Part Number',  value: selected.part_number,  mono: true },
        { label: 'Description',  value: selected.description },
        { label: 'VED Class',    value: selected.ved_class },
        { label: 'Status',       value: <StatusPill label={selected.status} variant={stateVariant(selected.status)} size="sm" /> },
        { label: 'On Hand',      value: String(selected.on_hand),      mono: true },
        { label: 'Reserved',     value: String(selected.reserved),     mono: true },
        { label: 'Available',    value: String(selected.available),    mono: true },
        { label: 'Min Stock',    value: String(selected.min_stock),    mono: true },
        { label: 'Lead Time',    value: `${selected.lead_time_days} days`, mono: true },
      ]
    : [];

  const spareActions: DrawerAction[] = selected
    ? [
        {
          id: 'reserve-stock',
          label: 'Reserve Stock',
          icon: 'folder',
          variant: 'primary',
          disabled: selected.available <= 0,
          disabledReason: 'No available stock to reserve',
          onClick: async () => {
            await apexClient.oem.listSpareParts({ part_number: selected.part_number, action: 'reserve' });
          },
        },
        {
          id: 'replenish',
          label: 'Initiate Replenishment Order',
          icon: 'gear',
          variant: 'secondary',
          disabled: selected.on_hand > selected.min_stock,
          disabledReason: 'Stock is above minimum threshold',
          onClick: async () => {
            await apexClient.oem.listSpareParts({ part_number: selected.part_number, action: 'replenish' });
          },
        },
        {
          id: 'refresh',
          label: 'Refresh Inventory',
          icon: 'list',
          variant: 'secondary',
          onClick: async () => {
            await refetch();
          },
        },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Spare Parts Inventory</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading...' : data.length + ' records'}</div>
      </div>
      <DataTable<OemSparePart>
        columns={SPARE_PARTS_SCREEN_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.description ?? 'Part Detail'}
        subtitle={selected ? `Part No: ${selected.part_number}` : undefined}
        entityRef={selected?.id.slice(-8)}
        status={selected?.status}
        fields={spareFields}
        actions={spareActions}
        onActionComplete={() => refetch()}
      />
    </div>
  );
}

function WarrantyScreen(): React.ReactElement {
  const { data, loading, refetch } = useOemWarrantyRecovery();
  const [selected, setSelected] = React.useState<OemWarrantyRecovery | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const warrantyFields: DrawerField[] = selected
    ? [
        { label: 'Claim Ref',       value: selected.claim_ref,       mono: true },
        { label: 'Defect Class',    value: selected.defect_class },
        { label: 'OEM',             value: selected.oem_name },
        { label: 'Failed Component',value: selected.failed_component },
        { label: 'Status',          value: <StatusPill label={selected.status} variant={stateVariant(selected.status)} size="sm" /> },
        { label: 'Claimed (ZAR)',   value: `R${(selected.claimed_zar / 1e6).toFixed(2)}M`, mono: true },
        { label: 'Recovery Rate',   value: selected.recovery_rate_pct != null ? `${selected.recovery_rate_pct.toFixed(1)}%` : '—', mono: true },
        { label: 'ETA',             value: selected.eta ?? '—', mono: true },
      ]
    : [];

  const warrantyActions: DrawerAction[] = selected
    ? [
        {
          id: 'initiate-recovery',
          label: 'Initiate Recovery Assessment',
          icon: 'certificate',
          variant: 'primary',
          disabled: selected.status === 'closed' || selected.status === 'settled',
          disabledReason: 'Claim is already closed or settled',
          onClick: async () => {
            await apexClient.oem.listWarrantyRecovery({ claim_ref: selected.claim_ref, action: 'assess' });
          },
        },
        {
          id: 'escalate-oem',
          label: 'Escalate to OEM',
          icon: 'alert-triangle',
          variant: 'secondary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'warranty_recovery', entity_id: selected.id });
          },
        },
        {
          id: 'refresh',
          label: 'Refresh Warranty Records',
          icon: 'list',
          variant: 'secondary',
          onClick: async () => {
            await refetch();
          },
        },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Warranty Recovery</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading...' : data.length + ' records'}</div>
      </div>
      <DataTable<OemWarrantyRecovery>
        columns={WARRANTY_RECOVERY_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.claim_ref ?? 'Warranty Claim'}
        subtitle={selected ? `${selected.oem_name} — ${selected.failed_component}` : undefined}
        entityRef={selected?.id.slice(-8)}
        status={selected?.status}
        fields={warrantyFields}
        actions={warrantyActions}
        onActionComplete={() => refetch()}
      />
    </div>
  );
}

function SecurityPatchScreen(): React.ReactElement {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'security_remediation' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const auditFields: DrawerField[] = selected
    ? [
        { label: 'Block ID',     value: selected.id,          mono: true },
        { label: 'Seq',          value: String(selected.seq),  mono: true },
        { label: 'Entity ID',    value: selected.entity_id,   mono: true },
        { label: 'Action',       value: selected.action,      mono: true },
        { label: 'Actor',        value: selected.actor_name ?? selected.actor_id },
        { label: 'Actor Role',   value: selected.actor_role ?? '—' },
        { label: 'Timestamp',    value: selected.timestamp,   mono: true },
        { label: 'Hash',         value: selected.hash.slice(0, 16) + '...', mono: true, span: true },
      ]
    : [];

  const auditActions: DrawerAction[] = selected
    ? [
        {
          id: 'triage-vuln',
          label: 'Triage Vulnerability',
          icon: 'lock',
          variant: 'primary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'security_remediation', entity_id: selected.entity_id });
          },
        },
        {
          id: 'refresh',
          label: 'Refresh Security Log',
          icon: 'list',
          variant: 'secondary',
          onClick: async () => {
            await refetch();
          },
        },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Security Patch Management</h1>
      <ActionPanel
        title="Security Actions"
        actions={[
          {
            id: 'initiate-remediation',
            label: 'Initiate Security Remediation',
            icon: 'lock',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Initiate Remediation"
                requireReason
                reasonCodes={[
                  { value: 'critical_cve',   label: 'Critical CVE — CVSS 9.0+' },
                  { value: 'high_cve',       label: 'High CVE — CVSS 7.0–8.9' },
                  { value: 'ot_vuln',        label: 'OT/ICS vulnerability' },
                  { value: 'patch_schedule', label: 'Scheduled patch cycle' },
                ]}
                confirmMessage="Initiating remediation triggers the W55 chain, assigns a triage window, and notifies the security operations team."
                onSubmit={async (data) => {
                  await apexClient.audit.listBlocks({ entity_type: 'security_remediation', ...data });
                  refetch();
                }}
              />
            ),
          },
        ]}
      />
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--oe-text-2)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginTop: '4px' }}>
        Security Remediation Activity — W55
      </div>
      <DataTable<AuditBlock>
        columns={AUDIT_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `Security Event: ${selected.action}` : 'Security Detail'}
        subtitle={selected ? `Entity: ${selected.entity_id}` : undefined}
        entityRef={selected?.id.slice(-8)}
        fields={auditFields}
        actions={auditActions}
        onActionComplete={() => refetch()}
      />
    </div>
  );
}

function FirmwareScreen(): React.ReactElement {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'firmware_patch' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const auditFields: DrawerField[] = selected
    ? [
        { label: 'Block ID',     value: selected.id,          mono: true },
        { label: 'Seq',          value: String(selected.seq),  mono: true },
        { label: 'Entity ID',    value: selected.entity_id,   mono: true },
        { label: 'Action',       value: selected.action,      mono: true },
        { label: 'Actor',        value: selected.actor_name ?? selected.actor_id },
        { label: 'Actor Role',   value: selected.actor_role ?? '—' },
        { label: 'Timestamp',    value: selected.timestamp,   mono: true },
        { label: 'Hash',         value: selected.hash.slice(0, 16) + '...', mono: true, span: true },
      ]
    : [];

  const auditActions: DrawerAction[] = selected
    ? [
        {
          id: 'schedule-patch',
          label: 'Schedule Patch Deployment',
          icon: 'gear',
          variant: 'primary',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'firmware_patch', entity_id: selected.entity_id });
          },
        },
        {
          id: 'rollback',
          label: 'Initiate Rollback',
          icon: 'alert-triangle',
          variant: 'danger',
          onClick: async () => {
            await apexClient.audit.listBlocks({ entity_type: 'firmware_patch', entity_id: selected.entity_id, action: 'rollback' });
          },
        },
        {
          id: 'refresh',
          label: 'Refresh Firmware Log',
          icon: 'list',
          variant: 'secondary',
          onClick: async () => {
            await refetch();
          },
        },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Firmware Updates</h1>
      <ActionPanel
        title="Firmware Actions"
        actions={[
          {
            id: 'initiate-patch',
            label: 'Initiate Firmware Patch',
            icon: 'gear',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Initiate Firmware Patch"
                requireReason={false}
                fields={[
                  { key: 'patch_version',  label: 'Patch Version',  type: 'text',     required: true },
                  { key: 'asset_id',       label: 'Target Asset ID', type: 'text',    required: true },
                  { key: 'release_notes',  label: 'Release Notes',  type: 'textarea', required: false },
                ]}
                onSubmit={async (data) => {
                  await apexClient.audit.listBlocks({ entity_type: 'firmware_patch', ...data });
                  refetch();
                }}
              />
            ),
          },
        ]}
      />
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--oe-text-2)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginTop: '4px' }}>
        Firmware Patch Activity — W55
      </div>
      <DataTable<AuditBlock>
        columns={AUDIT_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `Firmware Event: ${selected.action}` : 'Firmware Detail'}
        subtitle={selected ? `Entity: ${selected.entity_id}` : undefined}
        entityRef={selected?.id.slice(-8)}
        fields={auditFields}
        actions={auditActions}
        onActionComplete={() => refetch()}
      />
    </div>
  );
}

// ─── OemWorkstation ───────────────────────────────────────────────────────────

type ActiveScreen =
  | 'dashboard'
  | 'analytics'
  | 'tickets'
  | 'problems'
  | 'changes'
  | 'spareParts'
  | 'warranty'
  | 'security-patch'
  | 'firmware';

export function OemWorkstation(): React.ReactElement {
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('dashboard');

  // ── Live data hooks ─────────────────────────────────────────────────────────
  const { data: tickets, loading: ticketsLoading } = useOemTickets({ status: 'open' });
  const { data: spareParts, loading: spLoading } = useOemSpareParts();
  const { data: warrantyRecovery } = useOemWarrantyRecovery();

  // ── KPI computations ────────────────────────────────────────────────────────
  const openTickets = tickets.length;
  const criticalTickets = tickets.filter(t => t.priority === 'P1').length;
  const stockoutRisk = spareParts.filter(p => p.on_hand <= p.min_stock).length;
  const warrantyValue = warrantyRecovery.reduce((s, w) => s + (w.claimed_zar || 0), 0);

  const screenNavId: Record<ActiveScreen, string> = {
    dashboard:      'oem-dashboard',
    analytics:      'oem-analytics',
    tickets:        'oem-queue',
    problems:       'oem-problem',
    changes:        'oem-change',
    spareParts:     'oem-spares',
    warranty:       'oem-warranty-recovery',
    'security-patch': 'oem-security',
    firmware:       'oem-firmware',
  };

  const navClickMap: Record<string, () => void> = {
    'oem-dashboard':        () => setActiveScreen('dashboard'),
    'oem-analytics':        () => setActiveScreen('analytics'),
    'oem-queue':            () => setActiveScreen('tickets'),
    'oem-incident':         () => setActiveScreen('tickets'),
    'oem-problem':          () => setActiveScreen('problems'),
    'oem-change':           () => setActiveScreen('changes'),
    'oem-security':         () => setActiveScreen('security-patch'),
    'oem-warranty-claim':   () => setActiveScreen('warranty'),
    'oem-warranty-recovery':() => setActiveScreen('warranty'),
    'oem-fco':              () => setActiveScreen('warranty'),
    'oem-spares':           () => setActiveScreen('spareParts'),
    'oem-firmware':         () => setActiveScreen('firmware'),
    'oem-rpt-sla':          () => setActiveScreen('analytics'),
    'oem-rpt-incident':     () => setActiveScreen('tickets'),
    'oem-rpt-change':       () => setActiveScreen('changes'),
    'oem-settings':         () => setActiveScreen('dashboard'),
  };

  const liveNavConfig: NavConfig = {
    ...OEM_NAV,
    activeId: screenNavId[activeScreen],
    sections: OEM_NAV.sections.map(section => ({
      ...section,
      items: section.items.map(item => ({
        ...item,
        onClick: navClickMap[item.id],
      })),
    })),
  };

  const breadcrumbLabel: Record<ActiveScreen, string> = {
    dashboard:        'Dashboard',
    analytics:        'Analytics & Reports',
    tickets:          'Ticket Queue',
    problems:         'Problem Management',
    changes:          'Change Enablement',
    spareParts:       'Spare Parts',
    warranty:         'Warranty Recovery',
    'security-patch': 'Security Patch Management',
    firmware:         'Firmware Updates',
  };

  return (
    <AppShell
      role="support"
      userName="Priya Govender"
      userEmail="support@openenergy.co.za"
      navConfig={liveNavConfig}
      pageTitle="Support Operations"
      breadcrumbs={[{ label: 'OEM Support' }, { label: breadcrumbLabel[activeScreen] }]}
    >
      {activeScreen === 'analytics'     ? <OemAnalytics />
     : activeScreen === 'tickets'       ? <TicketsScreen />
     : activeScreen === 'problems'      ? <ProblemsScreen />
     : activeScreen === 'changes'       ? <ChangesScreen />
     : activeScreen === 'spareParts'    ? <SparePartsScreen />
     : activeScreen === 'warranty'      ? <WarrantyScreen />
     : activeScreen === 'security-patch'? <SecurityPatchScreen />
     : activeScreen === 'firmware'      ? <FirmwareScreen />
     : <>{/* Dashboard */}
      <div style={{ marginBottom: '20px' }}>
        <h1
          style={{
            fontSize: '22px',
            fontWeight: 800,
            color: 'var(--oe-text-1)',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          Support Operations
        </h1>
        <p
          style={{
            fontSize: '13px',
            color: 'var(--oe-text-3)',
            margin: '4px 0 0',
          }}
        >
          {ticketsLoading
            ? 'Loading...'
            : `${openTickets} open ticket${openTickets !== 1 ? 's' : ''} · ${criticalTickets} P1 · ${stockoutRisk} stockout risk`}
        </p>
      </div>

      {/* KPIs */}
      <StatGrid cols={4}>
        <StatCard
          label="Open Tickets"
          value={ticketsLoading ? '...' : String(openTickets)}
          delta={ticketsLoading ? undefined : `${criticalTickets} P1`}
          positive={false}
          icon="ticket"
          variant={criticalTickets > 0 ? 'rose' : 'default'}
        />
        <StatCard
          label="Critical Tickets"
          value={ticketsLoading ? '...' : String(criticalTickets)}
          subtext={ticketsLoading ? undefined : criticalTickets > 0 ? 'P1 SLA at risk' : 'No P1 open'}
          icon="clock"
          variant={criticalTickets > 0 ? 'rose' : 'green'}
        />
        <StatCard
          label="Stockout Risk"
          value={spLoading ? '...' : String(stockoutRisk)}
          subtext={spLoading ? undefined : stockoutRisk > 0 ? 'Parts at/below reorder pt' : 'Stock levels healthy'}
          icon="folder"
          variant={stockoutRisk > 0 ? 'amber' : 'green'}
        />
        <StatCard
          label="Warranty Recovery"
          value={warrantyValue > 0 ? `R${(warrantyValue / 1_000_000).toFixed(1)}M` : '—'}
          subtext="Active claim value"
          icon="certificate"
          variant="green"
        />
      </StatGrid>

      {/* Two-column layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
          gap: '16px',
          marginTop: '20px',
          alignItems: 'start',
        }}
      >
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Ticket queue table */}
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--oe-text-2)',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.05em',
                marginBottom: '8px',
              }}
            >
              Ticket Queue
            </div>
            <DataTable<OemTicket>
              columns={TICKET_COLUMNS}
              rows={tickets}
              loading={ticketsLoading}
              compact
            />
          </div>

          {/* Spare parts table */}
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--oe-text-2)',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.05em',
                marginBottom: '8px',
              }}
            >
              Spare Parts Inventory
            </div>
            <DataTable<OemSparePart>
              columns={SPARE_PARTS_COLUMNS}
              rows={spareParts}
              loading={spLoading}
              compact
            />
          </div>

          {/* INC state flow */}
          <SectionCard title="ITIL Chain: Active P1 Incident">
            <StateFlow steps={INC_STEPS} />
          </SectionCard>

          {/* SLA burn rate */}
          <SlaBurnRate />
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* AI insight */}
          <AIInsightCard
            title="P1 Escalation"
            suggestion="P1 ticket detected with critical SLA window. BESS thermal events in this jurisdiction have a 34% re-occurrence rate within 72 hours. Recommend raising a Problem record now to prevent recurrence."
            reasoning="Based on 14 BESS thermal incidents in the SA fleet over 24 months. IEC 62619 thermal runaway classification: requires root-cause analysis within 72h. Proactive Problem ticket prevents the W41 chain from triggering automatically."
            confidence="high"
          />

          {/* Chain map */}
          <ChainMap
            chainLabel="Active P1 Incident"
            chainType="Incident W14"
            currentState="Diagnosed"
            links={INC_CHAIN_LINKS}
          />

          {/* Action panel */}
          <ActionPanel
            title="Incident Actions"
            actions={[
              {
                id: 'escalate',
                label: 'Escalate Ticket',
                icon: 'escalate',
                variant: 'primary',
                form: (
                  <TransitionForm
                    actionLabel="Escalate Ticket"
                    requireReason
                    reasonCodes={[
                      { value: 'p1_breach', label: 'P1 SLA about to breach' },
                      { value: 'safety',    label: 'Safety risk — OHSA reportable' },
                      { value: 'customer',  label: 'Customer impact' },
                    ]}
                    confirmMessage="Escalating to P1 notifies the on-call manager, triggers a 60-minute SLA clock, and creates a NERSA notification if safety-related."
                    onSubmit={async (data) => {
                      const t = tickets.find(t => t.priority === 'P1');
                      if (t) await apexClient.oem.escalateTicket(t.id, data);
                    }}
                  />
                ),
              },
              {
                id: 'raise-problem',
                label: 'Raise Problem Record',
                icon: 'hierarchy',
                variant: 'secondary',
                form: (
                  <TransitionForm
                    actionLabel="Raise Problem Record"
                    requireReason={false}
                    fields={[
                      {
                        key: 'root_cause_hypothesis',
                        label: 'Root Cause Hypothesis',
                        type: 'textarea',
                        required: true,
                      },
                    ]}
                    onSubmit={async (data) => {
                      await apexClient.audit.listBlocks({ entity_type: 'problem_record', ...data });
                    }}
                  />
                ),
              },
              {
                id: 'initiate-change',
                label: 'Raise RFC / Change',
                icon: 'checklist',
                variant: 'ghost',
                description: 'W47 RFC — CAB review',
                form: (
                  <TransitionForm
                    actionLabel="Raise RFC / Change"
                    requireReason={false}
                    fields={[
                      {
                        key: 'change_title',
                        label: 'Change Title',
                        type: 'text',
                        required: true,
                      },
                      {
                        key: 'change_justification',
                        label: 'Justification',
                        type: 'textarea',
                        required: false,
                      },
                    ]}
                    onSubmit={async (data) => {
                      await apexClient.audit.listBlocks({ entity_type: 'rfc', ...data });
                    }}
                  />
                ),
              },
              {
                id: 'export-pack',
                label: 'Export Incident Pack',
                icon: 'export',
                variant: 'ghost',
                onClick: async () => {
                  await apexClient.audit.listBlocks({ entity_type: 'support_ticket', action: 'export' });
                },
              },
            ]}
          />
        </div>
      </div></>}
    </AppShell>
  );
}

export default OemWorkstation;
