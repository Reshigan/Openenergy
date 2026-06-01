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
  useCurrentUser,
} from '../../lib/hooks';
import { OemTicket, OemSparePart, OemWarrantyRecovery, AuditBlock, apexClient } from '../../lib/client';
import { api } from '../../../../lib/api';

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
        { id: 'oem-workorders', label: 'Work Orders W16',          href: '#wo',        icon: 'wrench' },
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
        { id: 'oem-fco',               label: 'FCO / Field Change W89',href: '#fco',            icon: 'gear' },
        { id: 'oem-contracts',         label: 'Service Contracts W80', href: '#contracts',      icon: 'document' },
        { id: 'oem-service-req',       label: 'Service Requests W104', href: '#service-req',    icon: 'checklist' },
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
      <AIInsightCard
        title="P1 Ticket TKT-2026-0089 — SLA Breach in 47 Minutes"
        suggestion="TKT-2026-0089 (grid inverter total failure, Kalahari Solar 500MW, P1 severity) was logged 2h13m ago. P1 SLA requires initial response within 1 hour (breached) and resolution within 4 hours (47 minutes remaining). Escalate to the senior field engineer on call and dispatch a technician to site — travel time is 35 minutes."
        reasoning="ITIL P1 SLA: a P1 ticket breach at 4 hours triggers automatic escalation to the Account Director and generates a contractual SLA breach report. For a grid-connected inverter failure, each hour of downtime costs R15,360 in lost generation (850kW × R1.28/kWh × 1h). The OEM O&M agreement §6.2 includes a financial penalty of R5,000/hour after the 4-hour resolution SLA."
        confidence="high"
        onAccept={() => {}}
      />
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
      <AIInsightCard
        title="Recurring Fault Pattern — 4 Incidents in 30 Days"
        suggestion="PROB-2026-0012 (IGBT thermal runaway, SMA Sunny Central 850kW) has been linked to 4 separate P2 incidents in the last 30 days across 3 different sites. This matches a fleet-level systemic fault pattern. Escalate to OEM engineering for a root-cause investigation and check if this falls under the EU AI Act fleet-systemic fault trigger (W129 classifier flagged this pattern 3 days ago)."
        reasoning="ITIL 4 Problem Management: 4 incidents from the same root cause within 30 days is a 'major problem' threshold. A major problem requires a formal Root Cause Analysis and a Problem Resolution Plan within 72 hours of declaration. If the root cause is a manufacturing defect, the OEM has a warranty recovery obligation (W63) that must be initiated within the statutory warranty period."
        confidence="high"
        onAccept={() => {}}
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
      <AIInsightCard
        title="RFC-2026-0034 Requires Emergency CAB Approval"
        suggestion="RFC-2026-0034 (SCADA firmware patch for critical CVE-2026-1847, P1 vulnerability) has been submitted as a standard change but should be reclassified as an emergency change given the active exploitation in the wild (CERT-SA alert issued yesterday). Reclassify and convene the Emergency CAB today — standard CAB meets Thursday which is too late for a P1 vulnerability."
        reasoning="ITIL 4 Change Enablement: critical security vulnerabilities with active exploitation qualify for emergency change classification. The Emergency CAB can approve the change within 4 hours vs the 5-day standard CAB cycle. The CVE-2026-1847 vulnerability allows unauthenticated remote code execution on SCADA HMI systems — a live threat that cannot wait for Thursday."
        confidence="high"
        onAccept={() => {}}
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
      <AIInsightCard
        title="Vital-Class Part Stockout — 0 Units on Hand"
        suggestion="SPP-2026-0041 (IGBT module, SMA Sunny Central 850kW, Vital class) shows 0 units in stock across all depots. Predicted demand from W71 RUL analysis: 2 units required within 60 days (inverter I-12 and I-07 both approaching end of RUL). Lead time from SMA SA distributor: 45-60 days. Raise a purchase order immediately — a stockout forces a reactive procurement at 40-60% price premium."
        reasoning="VED criticality classification: Vital parts cannot be substituted and their absence causes complete asset unavailability. The RUL model predicts I-12 failure within 120 days and I-07 within 90 days — both within a single procurement cycle. The 45-60 day lead time leaves no safety stock buffer. A reactive order during a forced outage typically costs R180,000-R240,000 in emergency premium vs R95,000 planned cost."
        confidence="high"
        onAccept={() => {}}
      />
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
      <AIInsightCard
        title="Warranty Claim WC-2026-0018 — Response Deadline Tomorrow"
        suggestion="Warranty claim WC-2026-0018 (transformer failure, R2.4M replacement cost, 18-month-old unit within 24-month warranty) has been pending OEM response for 27 days. The warranty agreement requires OEM response within 30 days — deadline is tomorrow. If no response is received by COB, send a formal notice of default and proceed with the warranty recovery chain (W63)."
        reasoning="Consumer Protection Act §56 + warranty agreement §8.1: the OEM must respond to a warranty claim within 30 days. A non-response constitutes a deemed rejection, which activates the contractual dispute mechanism. The R2.4M claim is within the warranty scope — transformer failure within 24 months is a covered defect unless the OEM can prove installation error or external damage."
        confidence="high"
        onAccept={() => {}}
      />
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

// ─── W15 RMA / Warranty Claim (inbound from asset) ───────────────────────────

type RmaRow = { id: string; ref: string; asset_serial: string; fault_description: string; chain_status: string; claim_date: string; oem_ref: string | null; tier: string };

const RMA_COLS: Column<RmaRow>[] = [
  { key: 'ref',              header: 'Claim Ref',    width: '140px', mono: true },
  { key: 'asset_serial',     header: 'Asset Serial', width: '160px', mono: true },
  { key: 'fault_description',header: 'Fault',        width: '260px' },
  { key: 'claim_date',       header: 'Lodged',       width: '130px', mono: true },
  { key: 'oem_ref',          header: 'OEM Ref',      width: '120px', mono: true, render: r => <span>{r.oem_ref ?? '—'}</span> },
  { key: 'chain_status',     header: 'Status',       width: '130px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
];

function RmaScreen(): React.ReactElement {
  const [rows, setRows] = React.useState<RmaRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<RmaRow | null>(null);
  React.useEffect(() => {
    api.get<{ data: RmaRow[] }>('/api/esums/warranty-claims')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  return (
    <div style={{ padding: '0 24px 24px' }}>
      <AIInsightCard
        suggestion="3 warranty claims (WC-2026-018, WC-2026-019, WC-2026-022) have been open for >90 days without manufacturer acknowledgement. Total disputed value is R4.2M. SANS warranty statute requires response within 90 days — formal escalation triggers the OEM's dispute resolution SLA."
        reasoning="CPA §56(3): if a warranty claim is not resolved within 90 days of notification, the consumer is entitled to refer the matter to the NCC. OEM dispute arbitration typically resolves within 45 days vs 18-month court timelines."
        title="Escalate to Arbitration"
        onAccept={() => {}}
      />
      <DataTable<RmaRow> rows={rows} columns={RMA_COLS} loading={loading} onRowClick={r => setSel(r)} />
      {sel && (
        <DetailDrawer open onClose={() => setSel(null)}
          title={sel.ref} subtitle={sel.asset_serial}
          entityRef={sel.ref} status={sel.chain_status}
          fields={[
            { label: 'Asset Serial',   value: sel.asset_serial, mono: true },
            { label: 'Fault',          value: sel.fault_description, span: true },
            { label: 'Claim Date',     value: sel.claim_date, mono: true },
            { label: 'OEM Reference',  value: sel.oem_ref ?? '—', mono: true },
            { label: 'Tier',           value: sel.tier },
          ]}
          actions={[
            { id: 'acknowledge', label: 'Acknowledge Claim', icon: 'check', variant: 'primary',
              onClick: () => api.post(`/api/esums/warranty-claims/${sel.id}/acknowledge`).then(() => setSel(null)) },
            { id: 'reject', label: 'Reject Claim', icon: 'reject', variant: 'danger',
              onClick: () => api.post(`/api/esums/warranty-claims/${sel.id}/reject`).then(() => setSel(null)) },
          ]}
        />
      )}
    </div>
  );
}

// ─── W16 Work Order Dispatch ──────────────────────────────────────────────────

type WoRow = { id: string; wo_number: string; asset_name: string; wo_type: string; priority: string; chain_status: string; scheduled_start: string | null; technician_name: string | null };

const WO_COLS: Column<WoRow>[] = [
  { key: 'wo_number',       header: 'WO #',        width: '130px', mono: true },
  { key: 'asset_name',      header: 'Asset',       width: '200px' },
  { key: 'wo_type',         header: 'Type',        width: '110px' },
  { key: 'priority',        header: 'Priority',    width: '90px',  render: r => <StatusPill label={r.priority} variant={stateVariant(r.priority)} /> },
  { key: 'technician_name', header: 'Technician',  width: '150px', render: r => <span>{r.technician_name ?? '—'}</span> },
  { key: 'scheduled_start', header: 'Scheduled',   width: '130px', mono: true, render: r => <span>{r.scheduled_start ?? '—'}</span> },
  { key: 'chain_status',    header: 'Status',      width: '120px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
];

function WorkOrdersScreen(): React.ReactElement {
  const [rows, setRows] = React.useState<WoRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<WoRow | null>(null);
  React.useEffect(() => {
    api.get<{ data: WoRow[] }>('/api/esums/wo-chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  return (
    <div style={{ padding: '0 24px 24px' }}>
      <AIInsightCard
        suggestion="WO-2026-047 (turbine gearbox oil analysis) is 8 days overdue and the technician has not logged a progress update in 5 days. Gearbox oil analysis results determine whether WO-2026-048 (planned replacement) should be brought forward from Q4 2026 to Q2."
        reasoning="IEC 62446-1 §6.3: O&M work orders with safety implications must have status updates logged every 48h. A 5-day gap in logging requires supervisory review before work can resume."
        title="Assign Supervisor Review"
        onAccept={() => {}}
      />
      <DataTable<WoRow> rows={rows} columns={WO_COLS} loading={loading} onRowClick={r => setSel(r)} />
      {sel && (
        <DetailDrawer open onClose={() => setSel(null)}
          title={sel.wo_number} subtitle={sel.asset_name}
          entityRef={sel.wo_number} status={sel.chain_status}
          fields={[
            { label: 'Asset',       value: sel.asset_name, span: true },
            { label: 'Type',        value: sel.wo_type },
            { label: 'Priority',    value: sel.priority },
            { label: 'Technician',  value: sel.technician_name ?? '—' },
            { label: 'Scheduled',   value: sel.scheduled_start ?? '—', mono: true },
          ]}
          actions={[
            { id: 'dispatch', label: 'Dispatch Technician', icon: 'send', variant: 'primary',
              onClick: () => api.post(`/api/esums/wo-chain/${sel.id}/dispatch`).then(() => setSel(null)) },
            { id: 'complete', label: 'Mark Complete', icon: 'check', variant: 'secondary',
              onClick: () => api.post(`/api/esums/wo-chain/${sel.id}/complete`).then(() => setSel(null)) },
          ]}
        />
      )}
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
      <AIInsightCard
        title="Critical CVE-2026-1847 — SCADA Systems Unpatched"
        suggestion="CVSS 9.8 vulnerability CVE-2026-1847 (remote code execution, SCADA HMI, unauthenticated) was disclosed 72 hours ago. 14 SCADA systems across 4 sites remain unpatched. The OT security policy requires critical CVEs to be remediated within 72 hours of patch availability — the patch was released by the vendor 6 hours ago. Begin immediate staged rollout starting with internet-facing systems."
        reasoning="POPIA §19 + NERSA Cybersecurity Baseline 2024: a CVSS 9.8 vulnerability on internet-facing OT systems creates a POPIA personal data risk and a NERSA grid security risk. If an exploitation incident occurs on an unpatched system, the CISO has a personal §19 liability exposure. The 72-hour remediation SLA is non-negotiable for critical CVSS scores — document the patch timeline for the next NERSA compliance audit."
        confidence="high"
        onAccept={() => {}}
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
      <AIInsightCard
        title="Firmware Cohort FC-2026-Q2 — 23 Devices Below Minimum Version"
        suggestion="Fleet firmware audit: 23 devices across 3 sites are running firmware below the minimum approved version (v4.2.1 — OEM mandatory update issued 15 Apr 2026). Devices on v4.1.x are no longer covered by the OEM's technical support SLA. Schedule a firmware push campaign for the next 2 maintenance windows — 12 devices can be updated remotely, 11 require on-site technician access."
        reasoning="OEM support terms §12.4: technical support coverage requires the device to be running an approved firmware version. Devices below the minimum version are unsupported — any incident on these devices will not be covered by the OEM warranty or support SLA. The 11 on-site devices are at 5 remote sites — coordinating on-site access requires 1-2 weeks of lead time."
        confidence="medium"
        onAccept={() => {}}
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

// ─── W80 Service Contracts / AMC ─────────────────────────────────────────────

type SvcContractRow = {
  id: string;
  ref: string;
  customer_name: string;
  contract_type: string;
  coverage_scope: string;
  expiry_date: string;
  chain_status: string;
  tier: string;
};

const SVC_CONTRACT_COLS: Column<SvcContractRow>[] = [
  { key: 'ref',            header: 'Reference',      width: '150px', mono: true },
  { key: 'customer_name', header: 'Customer',        width: '200px' },
  { key: 'contract_type', header: 'Type',            width: '130px' },
  { key: 'coverage_scope',header: 'Scope',           width: '200px' },
  {
    key: 'expiry_date',
    header: 'Expiry',
    width: '130px',
    mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>
        {r.expiry_date ?? '—'}
      </span>
    ),
  },
  {
    key: 'chain_status',
    header: 'Status',
    width: '140px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="xs" />,
  },
];

function ServiceContractsScreen(): React.ReactElement {
  const [rows, setRows] = React.useState<SvcContractRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<SvcContractRow | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    api
      .get<{ success: boolean; data: SvcContractRow[] }>('/service-contract/chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Service Contracts W80
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : rows.length + ' contracts'}
        </div>
      </div>
      <AIInsightCard
        title="Service Contracts Expiring Within 60 Days"
        suggestion="3 service contracts expire within 60 days — Kouga Phase 2 AMC (R2.8M/year) on 30 Jun, Perdekraal preventive maintenance (R1.4M/year) on 15 Jul, and Kalkfontein SCADA support (R680k/year) on 31 Jul. Renewal without negotiation auto-rolls at +8% CPI."
        reasoning="IEC 62402 §5.2 requires 90-day advance notice for contract renewals with modified scope. Initiating now ensures the correct SLA terms are locked in before the CPI uplift triggers."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<SvcContractRow>
        rows={rows}
        columns={SVC_CONTRACT_COLS}
        loading={loading}
        onRowClick={r => setSel(r)}
      />
      {sel && (
        <DetailDrawer
          open
          onClose={() => setSel(null)}
          title={sel.ref}
          subtitle={sel.customer_name}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'Customer',       value: sel.customer_name,  span: true },
            { label: 'Contract Type',  value: sel.contract_type },
            { label: 'Coverage Scope', value: sel.coverage_scope, span: true },
            { label: 'Tier',           value: sel.tier },
            { label: 'Expiry Date',    value: sel.expiry_date,    mono: true },
          ]}
          actions={[
            {
              id: 'activate',
              label: 'Activate Contract',
              icon: 'approve',
              variant: 'primary',
              onClick: () =>
                api
                  .post(`/service-contract/chain/${sel.id}/activate`)
                  .then(() => { setSel(null); load(); }),
            },
            {
              id: 'renew',
              label: 'Renew Contract',
              icon: 'calendar',
              variant: 'secondary',
              onClick: () =>
                api
                  .post(`/service-contract/chain/${sel.id}/renew`)
                  .then(() => { setSel(null); load(); }),
            },
            {
              id: 'terminate',
              label: 'Terminate Contract',
              icon: 'x-circle',
              variant: 'danger',
              onClick: () =>
                api
                  .post(`/service-contract/chain/${sel.id}/terminate`)
                  .then(() => { setSel(null); load(); }),
            },
          ]}
        />
      )}
    </div>
  );
}

// ─── W89 FCO / Field Change Order ─────────────────────────────────────────────

type FcoRow = {
  id: string;
  ref: string;
  affected_model: string;
  issue_description: string;
  fco_class: string;
  chain_status: string;
  release_date: string | null;
  tier: string;
};

const FCO_COLS: Column<FcoRow>[] = [
  { key: 'ref',              header: 'Reference',       width: '150px', mono: true },
  { key: 'affected_model',   header: 'Affected Model',  width: '180px' },
  { key: 'issue_description',header: 'Issue',           width: '260px' },
  { key: 'fco_class',        header: 'Class',           width: '100px' },
  {
    key: 'chain_status',
    header: 'Status',
    width: '140px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="xs" />,
  },
  {
    key: 'release_date',
    header: 'Released',
    width: '130px',
    mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>
        {r.release_date ?? '—'}
      </span>
    ),
  },
];

function FcoScreen(): React.ReactElement {
  const [rows, setRows] = React.useState<FcoRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<FcoRow | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    api
      .get<{ success: boolean; data: FcoRow[] }>('/oem-fco/chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          FCO / Field Change Orders W89
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : rows.length + ' FCOs'}
        </div>
      </div>
      <AIInsightCard
        title="Unacknowledged Critical-Safety FCOs"
        suggestion="FCO-2026-019 (BESS thermal management firmware) has been released but acknowledged by only 3 of 14 affected sites. Outstanding acknowledgements represent 847 MWh of capacity operating without the fix. Unacknowledged FCOs within 60 days of release void manufacturer warranty."
        reasoning="IEC 62619 §8.3: FCOs addressing thermal management are classified critical-safety and must be acknowledged within 60 days. Day 54 — 6 days remaining to avoid warranty voiding at 11 sites."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<FcoRow>
        rows={rows}
        columns={FCO_COLS}
        loading={loading}
        onRowClick={r => setSel(r)}
      />
      {sel && (
        <DetailDrawer
          open
          onClose={() => setSel(null)}
          title={sel.ref}
          subtitle={sel.affected_model}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'Affected Model',   value: sel.affected_model,    span: true },
            { label: 'Issue Description',value: sel.issue_description, span: true },
            { label: 'FCO Class',        value: sel.fco_class },
            { label: 'Tier',             value: sel.tier },
            { label: 'Release Date',     value: sel.release_date ?? '—', mono: true },
          ]}
          actions={[
            {
              id: 'release',
              label: 'Release FCO',
              icon: 'approve',
              variant: 'primary',
              onClick: () =>
                api
                  .post(`/oem-fco/chain/${sel.id}/release`)
                  .then(() => { setSel(null); load(); }),
            },
            {
              id: 'acknowledge',
              label: 'Acknowledge',
              icon: 'checklist',
              variant: 'secondary',
              onClick: () =>
                api
                  .post(`/oem-fco/chain/${sel.id}/acknowledge`)
                  .then(() => { setSel(null); load(); }),
            },
            {
              id: 'complete',
              label: 'Mark Complete',
              icon: 'check',
              variant: 'secondary',
              onClick: () =>
                api
                  .post(`/oem-fco/chain/${sel.id}/complete`)
                  .then(() => { setSel(null); load(); }),
            },
            {
              id: 'close',
              label: 'Close FCO',
              icon: 'x-circle',
              variant: 'secondary',
              onClick: () =>
                api
                  .post(`/oem-fco/chain/${sel.id}/close`)
                  .then(() => { setSel(null); load(); }),
            },
          ]}
        />
      )}
    </div>
  );
}

// ─── W104 Service Request Fulfilment ─────────────────────────────────────────

type ServiceReqRow = {
  id: string;
  ref: string;
  requested_by: string;
  catalog_item: string;
  tier: string;
  chain_status: string;
  submitted_at: string;
  fulfil_deadline: string | null;
};

const SERVICE_REQ_COLS: Column<ServiceReqRow>[] = [
  { key: 'ref',            header: 'Reference',    width: '150px', mono: true },
  { key: 'requested_by',   header: 'Requested By', width: '180px' },
  { key: 'catalog_item',   header: 'Catalog Item', width: '220px' },
  { key: 'tier',           header: 'Tier',         width: '90px' },
  {
    key: 'chain_status',
    header: 'Status',
    width: '140px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="xs" />,
  },
  {
    key: 'submitted_at',
    header: 'Submitted',
    width: '130px',
    mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>
        {r.submitted_at ?? '—'}
      </span>
    ),
  },
  {
    key: 'fulfil_deadline',
    header: 'Due',
    width: '130px',
    mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>
        {r.fulfil_deadline ?? '—'}
      </span>
    ),
  },
];

function ServiceRequestsScreen(): React.ReactElement {
  const [rows, setRows] = React.useState<ServiceReqRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<ServiceReqRow | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    api
      .get<{ success: boolean; data: ServiceReqRow[] }>('/support/service-request/chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Service Requests W104
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : rows.length + ' requests'}
        </div>
      </div>
      <AIInsightCard
        title="SLA Breaches Requiring Escalation"
        suggestion="14 open service requests have missed their SLA fulfilment deadline. 3 are marked urgent (priority: high) and have been pending for >48h — these are approaching the escalation threshold to management attention."
        reasoning="ITIL 4 §5.1.5: SLA breaches on high-priority service requests must be escalated to service owner within 2h of breach. 2 of the 3 have already passed the 2h mark."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<ServiceReqRow>
        rows={rows}
        columns={SERVICE_REQ_COLS}
        loading={loading}
        onRowClick={r => setSel(r)}
      />
      {sel && (
        <DetailDrawer
          open
          onClose={() => setSel(null)}
          title={sel.ref}
          subtitle={sel.catalog_item}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'Requested By',   value: sel.requested_by,           span: true },
            { label: 'Catalog Item',   value: sel.catalog_item,           span: true },
            { label: 'Tier',           value: sel.tier },
            { label: 'Submitted',      value: sel.submitted_at,           mono: true },
            { label: 'Fulfil Deadline',value: sel.fulfil_deadline ?? '—', mono: true },
          ]}
          actions={[
            {
              id: 'check-entitlement',
              label: 'Check Entitlement',
              icon: 'checklist',
              variant: 'primary',
              onClick: () =>
                api
                  .post(`/support/service-request/chain/${sel.id}/check_entitlement`)
                  .then(() => { setSel(null); load(); }),
            },
            {
              id: 'approve',
              label: 'Approve Request',
              icon: 'approve',
              variant: 'secondary',
              onClick: () =>
                api
                  .post(`/support/service-request/chain/${sel.id}/approve`)
                  .then(() => { setSel(null); load(); }),
            },
            {
              id: 'assign',
              label: 'Assign to Team',
              icon: 'wrench',
              variant: 'secondary',
              onClick: () =>
                api
                  .post(`/support/service-request/chain/${sel.id}/assign`)
                  .then(() => { setSel(null); load(); }),
            },
            {
              id: 'fulfil',
              label: 'Mark Fulfilled',
              icon: 'check',
              variant: 'secondary',
              onClick: () =>
                api
                  .post(`/support/service-request/chain/${sel.id}/fulfil`)
                  .then(() => { setSel(null); load(); }),
            },
            {
              id: 'verify',
              label: 'Verify Completion',
              icon: 'chart-line',
              variant: 'secondary',
              onClick: () =>
                api
                  .post(`/support/service-request/chain/${sel.id}/verify`)
                  .then(() => { setSel(null); load(); }),
            },
            {
              id: 'close',
              label: 'Close Request',
              icon: 'x-circle',
              variant: 'secondary',
              onClick: () =>
                api
                  .post(`/support/service-request/chain/${sel.id}/close`)
                  .then(() => { setSel(null); load(); }),
            },
          ]}
        />
      )}
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
  | 'rma'
  | 'workorders'
  | 'security-patch'
  | 'firmware'
  | 'contracts'
  | 'fco'
  | 'service-req';

export function OemWorkstation(): React.ReactElement {
  const { data: me } = useCurrentUser();
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
    rma:            'oem-warranty-claim',
    workorders:     'oem-workorders',
    'security-patch': 'oem-security',
    firmware:       'oem-firmware',
    contracts:      'oem-contracts',
    fco:            'oem-fco',
    'service-req':  'oem-service-req',
  };

  const navClickMap: Record<string, () => void> = {
    'oem-dashboard':        () => setActiveScreen('dashboard'),
    'oem-analytics':        () => setActiveScreen('analytics'),
    'oem-queue':            () => setActiveScreen('tickets'),
    'oem-incident':         () => setActiveScreen('tickets'),
    'oem-problem':          () => setActiveScreen('problems'),
    'oem-change':           () => setActiveScreen('changes'),
    'oem-security':         () => setActiveScreen('security-patch'),
    'oem-warranty-claim':   () => setActiveScreen('rma'),
    'oem-warranty-recovery':() => setActiveScreen('warranty'),
    'oem-fco':              () => setActiveScreen('fco'),
    'oem-contracts':        () => setActiveScreen('contracts'),
    'oem-service-req':      () => setActiveScreen('service-req'),
    'oem-workorders':       () => setActiveScreen('workorders'),
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
    rma:              'Warranty Claims (RMA)',
    workorders:       'Work Orders',
    'security-patch': 'Security Patch Management',
    firmware:         'Firmware Updates',
    contracts:        'Service Contracts',
    fco:              'FCO / Field Change Orders',
    'service-req':    'Service Requests',
  };

  return (
    <AppShell
      role="support"
      userName={me?.name ?? 'User'}
      userEmail={me?.email ?? ''}
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
     : activeScreen === 'rma'           ? <RmaScreen />
     : activeScreen === 'workorders'    ? <WorkOrdersScreen />
     : activeScreen === 'security-patch'? <SecurityPatchScreen />
     : activeScreen === 'firmware'      ? <FirmwareScreen />
     : activeScreen === 'contracts'     ? <ServiceContractsScreen />
     : activeScreen === 'fco'           ? <FcoScreen />
     : activeScreen === 'service-req'   ? <ServiceRequestsScreen />
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
                variant: 'secondary',
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
                variant: 'secondary',
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
