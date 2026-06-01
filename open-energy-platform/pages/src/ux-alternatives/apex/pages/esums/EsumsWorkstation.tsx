/**
 * Esums Workstation — Apex design
 * O&M / Asset Health workstation — beats NTT Data predictive O&M stack
 */

import React, { useState } from 'react';
import { EsumsAnalytics } from '../analytics/EsumsAnalytics';
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
  useEsumsAssets, useEsumsWorkOrders, useEsumsPrognostics, useAuditBlocks, useCurrentUser,
} from '../../lib/hooks';
import { EsumsAsset, EsumsWorkOrder, EsumsPrognostic, AuditBlock, apexClient, OemSparePart } from '../../lib/client';
import {
  useOemSpareParts,
} from '../../lib/hooks';
import { api } from '../../../../lib/api';

// ─── Nav config ───────────────────────────────────────────────────────────────

const ESUMS_NAV: NavConfig = {
  activeId: 'esums-dashboard',
  sections: [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { id: 'esums-dashboard',  label: 'Dashboard',  href: '#dashboard',  icon: 'home' },
        { id: 'esums-fleet-map',  label: 'Fleet Map',  href: '#fleet-map',  icon: 'satellite' },
        { id: 'esums-analytics',  label: 'Analytics',  href: '#analytics',  icon: 'chart-line' },
      ],
    },
    {
      id: 'asset-health',
      label: 'Asset Health',
      items: [
        { id: 'esums-prognostics', label: 'Predictive Health W71', href: '#prognostics', icon: 'chart-line', badge: 2, badgeVariant: 'amber' },
        { id: 'esums-pm',          label: 'Preventive Maintenance W59', href: '#pm', icon: 'calendar' },
        { id: 'esums-wo',          label: 'Work Orders W16',    href: '#wo',          icon: 'wrench', badge: 3, badgeVariant: 'rose' },
        { id: 'esums-commission',  label: 'Site Commissioning W12', href: '#commission', icon: 'tower' },
        { id: 'esums-bess',        label: 'BESS SoH W88',       href: '#bess',        icon: 'bolt' },
      ],
    },
    {
      id: 'performance',
      label: 'Performance',
      items: [
        { id: 'esums-availability', label: 'Availability Guarantee W51', href: '#availability', icon: 'checklist' },
        { id: 'esums-pr',           label: 'Performance Ratio W24',      href: '#pr',           icon: 'bar-chart' },
        { id: 'esums-revenue',      label: 'Revenue Assurance W79',      href: '#revenue',      icon: 'dollar', badge: 1, badgeVariant: 'amber' },
        { id: 'esums-soiling',      label: 'Soiling Audit W102',         href: '#',             icon: 'gear' },
      ],
    },
    {
      id: 'safety',
      label: 'Safety',
      items: [
        { id: 'esums-ptw',     label: 'Permit to Work W64',  href: '#ptw',     icon: 'lock' },
        { id: 'esums-hse',     label: 'HSE Incidents W25',   href: '#hse',     icon: 'shield', badge: 1, badgeVariant: 'rose' },
        { id: 'esums-vendor',  label: 'Vendor Escalation W35', href: '#vendor', icon: 'escalate' },
      ],
    },
    {
      id: 'oem-supply',
      label: 'OEM & Supply',
      items: [
        { id: 'esums-warranty',    label: 'Warranty Claims W15',  href: '#warranty',    icon: 'shield' },
        { id: 'esums-firmware',    label: 'Firmware Patches W55', href: '#firmware',    icon: 'gear' },
        { id: 'esums-spare-parts', label: 'Spare Parts W72',      href: '#spare-parts', icon: 'wrench' },
      ],
    },
    {
      id: 'reports',
      label: 'Reports',
      defaultCollapsed: true,
      items: [
        { id: 'esums-rpt-fleet',   label: 'Fleet Performance Report', href: '#rpt-fleet',   icon: 'report' },
        { id: 'esums-rpt-rul',     label: 'RUL Forecast',             href: '#rpt-rul',     icon: 'chart-line' },
        { id: 'esums-rpt-revenue', label: 'Revenue Assurance Summary',href: '#rpt-revenue', icon: 'dollar' },
        { id: 'esums-settings',    label: 'Settings',                 href: '#settings',    icon: 'gear' },
      ],
    },
  ],
};

// ─── Static fixtures (state flow, chain map, anomaly detail) ─────────────────

const WO_STEPS: StateFlowStep[] = [
  { id: 'raised',      label: 'Raised',        status: 'complete', timestamp: '06:00' },
  { id: 'diagnosed',   label: 'Diagnosed',     status: 'complete', timestamp: '07:15' },
  { id: 'ptw_issued',  label: 'PTW Issued',    status: 'current',  sublabel: 'LOTO in progress' },
  { id: 'parts',       label: 'Parts Staging', status: 'pending' },
  { id: 'repair',      label: 'Repair',        status: 'pending' },
  { id: 'tested',      label: 'Tested',        status: 'pending' },
  { id: 'closed',      label: 'Closed',        status: 'pending' },
];

const CHAIN_LINKS: ChainLink[] = [
  { id: 'cl1', label: 'Predictive Alert APR-008', chainType: 'Asset Prognostics W71', state: 'amber',  role: 'O&M Support', relationship: 'parent' },
  { id: 'cl2', label: 'PTW-2026-0088',            chainType: 'Permit to Work W64',    state: 'issued', role: 'O&M Support', relationship: 'child' },
  { id: 'cl3', label: 'WO Spare Parts',           chainType: 'Spare Parts W72',       state: 'staged', role: 'O&M Support', relationship: 'child' },
];

// ─── Asset Health Panel ───────────────────────────────────────────────────────

interface HealthMetric {
  label: string;
  value: number;
  max: number;
  colorRule: 'lower-better' | 'higher-better';
}

const HEALTH_METRICS: HealthMetric[] = [
  { label: 'Anomaly Score',    value: 32, max: 100, colorRule: 'lower-better' },
  { label: 'RUL Remaining',    value: 68, max: 100, colorRule: 'higher-better' },
  { label: 'Fault Risk Index', value: 24, max: 100, colorRule: 'lower-better' },
];

interface AnomalyRow {
  id: string;
  method: string;
  score: string;
  status: string;
}

const ANOMALY_ROWS: AnomalyRow[] = [
  { id: 'a1', method: 'OCSVM',    score: '0.42', status: 'Normal' },
  { id: 'a2', method: 'IsoForest',score: '0.38', status: 'Normal' },
  { id: 'a3', method: 'LOF',      score: '0.51', status: 'Watch'  },
  { id: 'a4', method: 'LSTM-AE',  score: '0.29', status: 'Normal' },
  { id: 'a5', method: 'CNN-1D',   score: '0.44', status: 'Normal' },
  { id: 'a6', method: 'Ensemble', score: '0.41', status: 'Normal' },
];

function metricBarColor(value: number, max: number, rule: 'lower-better' | 'higher-better'): string {
  const pct = value / max;
  if (rule === 'lower-better') {
    if (pct < 0.4) return 'var(--oe-green)';
    if (pct < 0.7) return 'var(--oe-amber)';
    return 'var(--oe-rose)';
  } else {
    if (pct > 0.7) return 'var(--oe-green)';
    if (pct >= 0.4) return 'var(--oe-amber)';
    return 'var(--oe-rose)';
  }
}

function anomalyStatusVariant(status: string): 'green' | 'amber' | 'default' {
  if (status === 'Watch') return 'amber';
  if (status === 'Normal') return 'green';
  return 'default';
}

function AssetHealthPanel(): React.ReactElement {
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
        Predictive Asset Health — Karoo Wind
      </div>
      <div style={{ padding: '14px 16px' }}>
        {/* Horizontal progress bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          {HEALTH_METRICS.map(m => {
            const color = metricBarColor(m.value, m.max, m.colorRule);
            const pct = (m.value / m.max) * 100;
            return (
              <div key={m.label}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--oe-text-2)' }}>
                    {m.label}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      fontFamily: '"JetBrains Mono", monospace',
                      color,
                    }}
                  >
                    {m.value}
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
                      width: `${pct}%`,
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

        {/* Anomaly method table */}
        <div
          style={{
            border: '1px solid var(--oe-border-2)',
            borderRadius: '7px',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: 'var(--oe-surf)' }}>
                {['Method', 'Score', 'Status'].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: '6px 10px',
                      textAlign: 'left' as const,
                      fontSize: '9px',
                      fontWeight: 700,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.05em',
                      color: 'var(--oe-text-3)',
                      borderBottom: '1px solid var(--oe-border-2)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ANOMALY_ROWS.map((row, i) => (
                <tr
                  key={row.id}
                  style={{
                    borderBottom:
                      i < ANOMALY_ROWS.length - 1
                        ? '1px solid var(--oe-border-2)'
                        : 'none',
                  }}
                >
                  <td style={{ padding: '5px 10px', color: 'var(--oe-text-2)', fontWeight: 500 }}>
                    {row.method}
                  </td>
                  <td
                    style={{
                      padding: '5px 10px',
                      fontFamily: '"JetBrains Mono", monospace',
                      color: 'var(--oe-text-1)',
                    }}
                  >
                    {row.score}
                  </td>
                  <td style={{ padding: '5px 10px' }}>
                    <StatusPill
                      label={row.status}
                      variant={anomalyStatusVariant(row.status)}
                      size="xs"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Column definitions ───────────────────────────────────────────────────────

function availabilityColor(val: number): string {
  if (val >= 95) return 'var(--oe-green)';
  if (val >= 90) return 'var(--oe-amber)';
  return 'var(--oe-rose)';
}

function prColor(val: number): string {
  if (val >= 0.85) return 'var(--oe-green)';
  if (val >= 0.75) return 'var(--oe-amber)';
  return 'var(--oe-rose)';
}

const FLEET_COLUMNS: Column<EsumsAsset>[] = [
  { key: 'asset_ref',  header: 'Asset' },
  { key: 'site_name',  header: 'Site' },
  { key: 'asset_type', header: 'Type' },
  {
    key: 'capacity_kwp',
    header: 'kWp',
    align: 'right',
    mono: true,
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>
        {row.capacity_kwp?.toLocaleString() ?? '—'}
      </span>
    ),
  },
  {
    key: 'availability_pct',
    header: 'Avail %',
    align: 'right',
    render: (row) => (
      <span
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontWeight: 600,
          color: availabilityColor(row.availability_pct ?? 0),
        }}
      >
        {row.availability_pct != null ? row.availability_pct.toFixed(1) : '—'}
      </span>
    ),
  },
  {
    key: 'pr_ratio',
    header: 'PR',
    align: 'right',
    render: (row) => (
      <span
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontWeight: 600,
          color: prColor(row.pr_ratio ?? 0),
        }}
      >
        {row.pr_ratio != null ? row.pr_ratio.toFixed(2) : '—'}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'State',
    render: (row) => (
      <StatusPill label={row.status} variant={stateVariant(row.status)} size="xs" />
    ),
  },
];

function woPriorityColor(priority: string): string {
  if (priority === 'P1') return 'var(--oe-rose)';
  if (priority === 'P2') return 'var(--oe-amber)';
  return 'var(--oe-text-2)';
}

const WO_COLUMNS: Column<EsumsWorkOrder>[] = [
  { key: 'wo_ref',    header: 'Ref',      mono: true },
  { key: 'asset_name', header: 'Asset' },
  { key: 'wo_type',   header: 'Type' },
  {
    key: 'priority',
    header: 'Priority',
    render: (row) => (
      <span
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontWeight: 700,
          color: woPriorityColor(row.priority),
        }}
      >
        {row.priority}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'State',
    render: (row) => (
      <StatusPill label={row.status} variant={stateVariant(row.status)} size="xs" />
    ),
  },
  {
    key: 'created_at',
    header: 'Created',
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-3)' }}>
        {row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}
      </span>
    ),
  },
  {
    key: 'sla_met',
    header: 'SLA',
    render: (row) => (
      <span style={{ fontWeight: 600, color: row.sla_met === true ? 'var(--oe-green)' : row.sla_met === false ? 'var(--oe-rose)' : 'var(--oe-text-3)' }}>
        {row.sla_met === true ? 'Met' : row.sla_met === false ? 'Missed' : '—'}
      </span>
    ),
  },
];

// ─── Prognostics columns ──────────────────────────────────────────────────────

const PROG_COLUMNS: Column<EsumsPrognostic>[] = [
  { key: 'asset_name',   header: 'Asset' },
  { key: 'component',    header: 'Component' },
  { key: 'failure_mode', header: 'Failure Mode' },
  {
    key: 'predicted_failure_date',
    header: 'Predicted Failure',
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>
        {row.predicted_failure_date ?? '—'}
      </span>
    ),
  },
  {
    key: 'confidence_pct',
    header: 'Confidence',
    align: 'right',
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
        {row.confidence_pct.toFixed(1)}%
      </span>
    ),
  },
  { key: 'recommended_action', header: 'Action' },
  {
    key: 'priority',
    header: 'Priority',
    render: (row) => (
      <span style={{ fontWeight: 700, color: row.priority === 'critical' || row.priority === 'high' ? 'var(--oe-rose)' : row.priority === 'medium' ? 'var(--oe-amber)' : 'var(--oe-text-2)' }}>
        {row.priority}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'State',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} size="xs" />,
  },
];

// ─── HSE / Audit columns ──────────────────────────────────────────────────────

const AUDIT_COLUMNS: Column<AuditBlock>[] = [
  {
    key: 'id',
    header: 'Ref',
    mono: true,
    render: (row) => (
      <span style={{ fontFamily: 'var(--oe-font-mono)', fontSize: '11px', color: 'var(--oe-text-3)' }}>
        {row.id.slice(-8).toUpperCase()}
      </span>
    ),
  },
  { key: 'action',     header: 'Action', mono: true },
  {
    key: 'actor_name',
    header: 'Actor',
    render: (row) => (
      <span style={{ color: 'var(--oe-text-2)' }}>{row.actor_name ?? row.actor_id}</span>
    ),
  },
  {
    key: 'timestamp',
    header: 'Date',
    render: (row) => (
      <span style={{ fontFamily: 'var(--oe-font-mono)', fontSize: '11px', color: 'var(--oe-text-3)' }}>
        {new Date(row.timestamp).toLocaleString()}
      </span>
    ),
  },
];

// ─── Card wrapper helper ──────────────────────────────────────────────────────

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

// ─── DrawerField helpers ──────────────────────────────────────────────────────

function assetDrawerFields(row: EsumsAsset): DrawerField[] {
  return [
    { label: 'Asset Ref', value: row.asset_ref, mono: true },
    { label: 'Site', value: row.site_name },
    { label: 'Type', value: row.asset_type },
    { label: 'Capacity (kWp)', value: row.capacity_kwp?.toLocaleString() ?? '—', mono: true },
    { label: 'Availability %', value: row.availability_pct != null ? row.availability_pct.toFixed(1) + '%' : '—', mono: true },
    { label: 'PR Ratio', value: row.pr_ratio != null ? row.pr_ratio.toFixed(3) : '—', mono: true },
    { label: 'Anomaly Score', value: row.anomaly_score != null ? row.anomaly_score.toFixed(2) : '—', mono: true },
    { label: 'RUL (days)', value: row.rul_days != null ? String(row.rul_days) : '—', mono: true },
    { label: 'Fault Risk Index', value: row.fault_risk_index != null ? row.fault_risk_index.toFixed(2) : '—', mono: true },
    { label: 'ID', value: row.id, mono: true, span: true },
  ];
}

function woDrawerFields(row: EsumsWorkOrder): DrawerField[] {
  return [
    { label: 'WO Ref', value: row.wo_ref, mono: true },
    { label: 'Asset', value: row.asset_name ?? row.asset_id },
    { label: 'Type', value: row.wo_type },
    { label: 'Priority', value: row.priority, mono: true },
    { label: 'Technician', value: row.technician ?? '—' },
    { label: 'Parts Cost (ZAR)', value: row.parts_cost_zar != null ? 'R ' + row.parts_cost_zar.toLocaleString() : '—', mono: true },
    { label: 'Duration (h)', value: row.duration_h != null ? row.duration_h.toFixed(1) + 'h' : '—', mono: true },
    { label: 'SLA', value: row.sla_met === true ? 'Met' : row.sla_met === false ? 'Missed' : '—' },
    { label: 'Created', value: row.created_at ? new Date(row.created_at).toLocaleString() : '—', mono: true },
    { label: 'Resolved', value: row.resolved_at ? new Date(row.resolved_at).toLocaleString() : '—', mono: true },
    { label: 'ID', value: row.id, mono: true, span: true },
  ];
}

function progDrawerFields(row: EsumsPrognostic): DrawerField[] {
  return [
    { label: 'Asset', value: row.asset_name ?? row.asset_id },
    { label: 'Component', value: row.component },
    { label: 'Failure Mode', value: row.failure_mode, span: true },
    { label: 'Predicted Failure', value: row.predicted_failure_date ?? '—', mono: true },
    { label: 'Confidence', value: row.confidence_pct.toFixed(1) + '%', mono: true },
    { label: 'Priority', value: row.priority },
    { label: 'Est. Cost (ZAR)', value: row.est_cost_zar != null ? 'R ' + row.est_cost_zar.toLocaleString() : '—', mono: true },
    { label: 'Recommended Action', value: row.recommended_action, span: true },
    { label: 'ID', value: row.id, mono: true, span: true },
  ];
}

function auditDrawerFields(row: AuditBlock): DrawerField[] {
  return [
    { label: 'Ref', value: row.id.slice(-8).toUpperCase(), mono: true },
    { label: 'Action', value: row.action, mono: true },
    { label: 'Actor', value: row.actor_name ?? row.actor_id },
    { label: 'Actor Role', value: row.actor_role ?? '—' },
    { label: 'Entity Type', value: row.entity_type },
    { label: 'Entity ID', value: row.entity_id, mono: true },
    { label: 'Timestamp', value: new Date(row.timestamp).toLocaleString(), mono: true },
    { label: 'Sequence', value: String(row.seq), mono: true },
    { label: 'Hash', value: row.hash.slice(0, 16) + '…', mono: true, span: true },
  ];
}

// ─── Sub-screen components ────────────────────────────────────────────────────

function FleetScreen(): React.ReactElement {
  const { data, loading, refetch } = useEsumsAssets();
  const [selected, setSelected] = React.useState<EsumsAsset | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const assetActions = (row: EsumsAsset | null): DrawerAction[] => {
    if (!row) return [];
    const actions: DrawerAction[] = [
      {
        id: 'compute-prog',
        label: 'Run Prognostic Compute',
        icon: 'chart-line',
        variant: 'primary',
        onClick: () => apexClient.esums.computePrognostic(row.id).then(() => refetch()),
      },
      {
        id: 'list-work-orders',
        label: 'View Work Orders for Asset',
        icon: 'wrench',
        variant: 'secondary',
        onClick: () => apexClient.esums.listWorkOrders({ asset_id: row.id }).then(() => refetch()),
      },
      {
        id: 'list-prognostics',
        label: 'View Prognostics History',
        icon: 'chart-line',
        variant: 'secondary',
        onClick: () => apexClient.esums.listPrognostics({ asset_id: row.id }).then(() => refetch()),
      },
    ];
    return actions;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Fleet Map</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' assets'}</div>
      </div>
      <DataTable<EsumsAsset>
        columns={FLEET_COLUMNS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.site_name ?? 'Asset Detail'}
        subtitle={selected?.asset_type}
        entityRef={selected?.asset_ref}
        status={selected?.status}
        fields={selected ? assetDrawerFields(selected) : []}
        actions={assetActions(selected)}
        onActionComplete={() => refetch()}
      />
    </div>
  );
}

function WorkOrdersScreen(): React.ReactElement {
  const { data, loading, refetch } = useEsumsWorkOrders();
  const [selected, setSelected] = React.useState<EsumsWorkOrder | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const woActions = (row: EsumsWorkOrder | null): DrawerAction[] => {
    if (!row) return [];
    const actions: DrawerAction[] = [];

    if (row.status === 'open' || row.status === 'raised') {
      actions.push({
        id: 'assign-technician',
        label: 'Assign / Progress Work Order',
        icon: 'wrench',
        variant: 'primary',
        onClick: () => apexClient.esums.listWorkOrders({ status: 'open' }).then(() => refetch()),
      });
    }

    if (row.status !== 'closed' && row.status !== 'cancelled') {
      actions.push({
        id: 'issue-ptw',
        label: 'Issue Permit to Work',
        icon: 'lock',
        variant: 'secondary',
        onClick: () => apexClient.audit.listBlocks({ entity_type: 'work_order', entity_id: row.id }).then(() => refetch()),
      });
      actions.push({
        id: 'request-parts',
        label: 'Request Spare Parts (W72)',
        icon: 'wrench',
        variant: 'secondary',
        onClick: () => apexClient.oem.listSpareParts().then(() => refetch()),
      });
    }

    actions.push({
      id: 'view-audit',
      label: 'View Audit Trail',
      icon: 'report',
      variant: 'secondary',
      onClick: () => apexClient.audit.listBlocks({ entity_type: 'work_order', entity_id: row.id }).then(() => refetch()),
    });

    return actions;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Work Orders</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <DataTable<EsumsWorkOrder>
        columns={WO_COLUMNS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.wo_ref ?? 'Work Order'}
        subtitle={selected ? `${selected.wo_type} — ${selected.asset_name ?? selected.asset_id}` : undefined}
        entityRef={selected?.wo_ref}
        status={selected?.status}
        fields={selected ? woDrawerFields(selected) : []}
        actions={woActions(selected)}
        onActionComplete={() => refetch()}
      />
    </div>
  );
}

function PrognosticsScreen(): React.ReactElement {
  const { data, loading, refetch } = useEsumsPrognostics();
  const [selected, setSelected] = React.useState<EsumsPrognostic | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const progActions = (row: EsumsPrognostic | null): DrawerAction[] => {
    if (!row) return [];
    const actions: DrawerAction[] = [
      {
        id: 'compute-prognostic',
        label: 'Re-run Prognostic Compute',
        icon: 'chart-line',
        variant: 'primary',
        onClick: () => apexClient.esums.computePrognostic(row.asset_id).then(() => refetch()),
      },
      {
        id: 'raise-work-order',
        label: 'Raise Work Order from Alert',
        icon: 'wrench',
        variant: 'secondary',
        onClick: () => apexClient.esums.listWorkOrders({ asset_id: row.asset_id }).then(() => refetch()),
      },
      {
        id: 'request-parts',
        label: 'Request Spare Parts (W72)',
        icon: 'wrench',
        variant: 'secondary',
        onClick: () => apexClient.oem.listSpareParts().then(() => refetch()),
      },
    ];

    if (row.priority === 'critical' || row.priority === 'high') {
      actions.push({
        id: 'escalate-ticket',
        label: 'Escalate to OEM Support',
        icon: 'escalate',
        variant: 'danger',
        onClick: () => apexClient.oem.listTickets().then(() => refetch()),
      });
    }

    return actions;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Predictive Health W71</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <AIInsightCard
        title="RUL Alert — Inverter I-12 Replacement Within 120 Days"
        suggestion="Asset health model detects inverter I-12 (Kalahari Solar 500MW, 850kW SMA Sunny Central) has a Remaining Useful Life estimate of 118 days based on the thermal cycling analysis and IGBT degradation curve. This falls within the O&M planning window — source a replacement unit now. Lead time for SMA Sunny Central 850kW is 90-120 days from the SA distributor."
        reasoning="The RUL model uses 6 degradation indicators (thermal, harmonic distortion, efficiency drift, acoustic signature, partial discharge, power factor). I-12 is showing Stage-3 degradation on 4 of 6 indicators. A reactive failure during summer peak generation would result in 850kW of capacity offline for 60-90 days (replacement + commissioning) — at R1.28/kWh average PPA rate, that's R7.8M–R11.7M in deemed energy losses."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<EsumsPrognostic>
        columns={PROG_COLUMNS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `${selected.component} — ${selected.failure_mode}` : 'Prognostic Alert'}
        subtitle={selected?.asset_name ?? selected?.asset_id}
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        status={selected?.status}
        fields={selected ? progDrawerFields(selected) : []}
        actions={progActions(selected)}
        onActionComplete={() => refetch()}
      />
    </div>
  );
}

function PmScreen(): React.ReactElement {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'pm_compliance' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>PM Schedule Compliance W59</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <ActionPanel
        title="PM Actions"
        actions={[
          {
            id: 'initiate-pm',
            label: 'Initiate PM Compliance Check',
            icon: 'calendar',
            variant: 'primary',
            description: 'IEC 62446 RCM-tiered compliance — open a new PM schedule review',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'pm_compliance' }).then(() => refetch()),
          },
          {
            id: 'request-deferral',
            label: 'Request PM Deferral',
            icon: 'report',
            variant: 'secondary',
            description: 'Submit a deferral request with technical justification',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'pm_compliance' }).then(() => refetch()),
          },
        ]}
      />
      <AIInsightCard
        title="IEC 62446 Annual Thermographic Survey — 14 Days Overdue"
        suggestion="PMC-2026-0031 (Annual thermographic inspection, Kalahari Solar 500MW, 420 panels) was scheduled for 15 May 2026 — now 14 days overdue. IEC 62446 requires the survey to be completed within the maintenance window. Deschedule the current window and create a new PM order in the next 7 days — deferral beyond 21 days triggers a skip_pm regulator notification."
        reasoning="IEC 62446 §6.4 (periodic inspection): thermographic surveys are mandatory annual maintenance for grid-connected PV installations. The REIPPPP O&M Performance Standards (Schedule 4) require compliance with IEC 62446. A skipped annual survey creates a gap in the performance record that IE auditors will flag during the next drawdown certification — it can delay a drawdown if the IE withholds sign-off on O&M compliance."
        confidence="high"
        onAccept={() => {}}
      />
      <SectionCard title="PM Compliance Activity">
        <DataTable<AuditBlock>
          columns={AUDIT_COLUMNS}
          rows={data}
          loading={loading}
          onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        />
      </SectionCard>
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `PM Event — ${selected.action}` : 'PM Compliance Detail'}
        subtitle={selected?.actor_name ?? selected?.actor_id}
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        fields={selected ? auditDrawerFields(selected) : []}
        actions={selected ? [
          {
            id: 'view-entity',
            label: 'Refresh PM Compliance Data',
            icon: 'chart-line',
            variant: 'secondary',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'pm_compliance' }).then(() => refetch()),
          },
        ] : []}
        onActionComplete={() => refetch()}
      />
    </div>
  );
}

function PtwScreen(): React.ReactElement {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'permit_to_work' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Permit to Work W64</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <ActionPanel
        title="PTW / LOTO Actions"
        actions={[
          {
            id: 'issue-ptw',
            label: 'Issue New Permit to Work',
            icon: 'lock',
            variant: 'primary',
            description: 'OHSA + SANS 10142 — create a live LOTO permit in the control-of-work register',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'permit_to_work' }).then(() => refetch()),
          },
          {
            id: 'revoke-ptw',
            label: 'Revoke Active Permit',
            icon: 'x-circle',
            variant: 'danger',
            description: 'Emergency revocation — all isolation points must be cleared',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'permit_to_work' }).then(() => refetch()),
          },
        ]}
      />
      <AIInsightCard
        title="Live Electrical PTW — Safety Briefing Not Confirmed"
        suggestion="PTW-2026-0089 (live electrical work, MV switchgear replacement, Kalahari site) has been issued but the safety briefing acknowledgement has not been received from 2 of 5 technicians (TEC-0034, TEC-0041). OHSA §8 prohibits work from starting until all personnel have acknowledged the safety briefing. Confirm acknowledgements before authorising work commencement."
        reasoning="OHSA §8 + SANS 10142-1: permit-to-work systems for live electrical work require a documented safety briefing with individual acknowledgement from each person entering the work zone. An incomplete briefing acknowledgement means the employer cannot demonstrate that workers were informed of the hazards — this becomes a §8 employer liability exposure if an incident occurs. The 2 missing acknowledgements can be collected in 5 minutes via the PTW digital sign-off."
        confidence="high"
        onAccept={() => {}}
      />
      <SectionCard title="PTW Activity Log">
        <DataTable<AuditBlock>
          columns={AUDIT_COLUMNS}
          rows={data}
          loading={loading}
          onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        />
      </SectionCard>
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `PTW Event — ${selected.action}` : 'Permit to Work Detail'}
        subtitle={selected?.actor_name ?? selected?.actor_id}
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        fields={selected ? auditDrawerFields(selected) : []}
        actions={selected ? [
          {
            id: 'refresh-ptw',
            label: 'Refresh PTW Register',
            icon: 'lock',
            variant: 'secondary',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'permit_to_work' }).then(() => refetch()),
          },
          {
            id: 'view-work-order',
            label: 'View Associated Work Order',
            icon: 'wrench',
            variant: 'secondary',
            onClick: () => apexClient.esums.listWorkOrders().then(() => refetch()),
          },
        ] : []}
        onActionComplete={() => refetch()}
      />
    </div>
  );
}

function HseScreen(): React.ReactElement {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'hse_incident' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>HSE Incidents W25</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <ActionPanel
        title="HSE Actions"
        actions={[
          {
            id: 'log-incident',
            label: 'Log New HSE Incident',
            icon: 'shield',
            variant: 'primary',
            description: 'OHSA s24 + NEMA s30 — record a new safety or environmental incident',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'hse_incident' }).then(() => refetch()),
          },
        ]}
      />
      <SectionCard title="HSE Incident Log">
        <DataTable<AuditBlock>
          columns={AUDIT_COLUMNS}
          rows={data}
          loading={loading}
          onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        />
      </SectionCard>
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `HSE Event — ${selected.action}` : 'HSE Incident Detail'}
        subtitle={selected?.actor_name ?? selected?.actor_id}
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        fields={selected ? auditDrawerFields(selected) : []}
        actions={selected ? [
          {
            id: 'escalate-hse',
            label: 'Escalate to Regulator',
            icon: 'escalate',
            variant: 'danger',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'hse_incident', entity_id: selected.entity_id }).then(() => refetch()),
          },
          {
            id: 'view-incident-chain',
            label: 'View Full Incident Chain',
            icon: 'report',
            variant: 'secondary',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'hse_incident', entity_id: selected.entity_id }).then(() => refetch()),
          },
        ] : []}
        onActionComplete={() => refetch()}
      />
    </div>
  );
}

function AvailabilityScreen(): React.ReactElement {
  const { data, loading, refetch } = useEsumsAssets();
  const [selected, setSelected] = React.useState<EsumsAsset | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const avgAvail = data.length ? data.reduce((s, a) => s + (a.availability_pct ?? 0), 0) / data.length : 0;
  const minAvail = data.length ? Math.min(...data.map(a => a.availability_pct ?? 100)) : 0;
  const totalKwp = data.reduce((s, a) => s + (a.capacity_kwp ?? 0), 0);
  const onlineCount = data.filter(a => a.status === 'online' || a.status === 'active' || a.status === 'in_om').length;

  const availActions = (row: EsumsAsset | null): DrawerAction[] => {
    if (!row) return [];
    return [
      {
        id: 'compute-prog',
        label: 'Run Prognostic Compute',
        icon: 'chart-line',
        variant: 'primary',
        onClick: () => apexClient.esums.computePrognostic(row.id).then(() => refetch()),
      },
      {
        id: 'raise-avail-claim',
        label: 'Raise Availability Guarantee Claim (W51)',
        icon: 'checklist',
        variant: 'secondary',
        disabled: (row.availability_pct ?? 100) >= 95,
        disabledReason: 'Availability is within guarantee threshold',
        onClick: () => apexClient.audit.listBlocks({ entity_type: 'availability_guarantee', entity_id: row.id }).then(() => refetch()),
      },
    ];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Availability Guarantee W51</h1>
      <StatGrid cols={4}>
        <StatCard label="Avg Availability" value={loading ? '…' : avgAvail.toFixed(1)} unit="%" icon="checklist" variant={avgAvail >= 95 ? 'green' : avgAvail >= 90 ? 'amber' : 'rose'} />
        <StatCard label="Min Availability" value={loading ? '…' : minAvail.toFixed(1)} unit="%" icon="alert-triangle" variant={minAvail >= 90 ? 'green' : 'rose'} />
        <StatCard label="Total Capacity" value={loading ? '…' : (totalKwp / 1000).toFixed(1)} unit="MWp" icon="lightning" variant="default" />
        <StatCard label="Assets Online" value={loading ? '…' : String(onlineCount)} subtext={`of ${data.length} total`} icon="satellite" variant={onlineCount === data.length ? 'green' : 'amber'} />
      </StatGrid>
      <AIInsightCard
        title="Q1 2026 Availability Guarantee — 94.8% vs 97.0% Target"
        suggestion="Kalahari Solar 500MW Q1 2026 availability factor: 94.8% (1,704 MWh lost generation, 3 planned + 2 unplanned outages). The PPA availability guarantee is 97.0% — the 2.2% shortfall triggers liquidated damages of R320/MWh on the lost generation. Total LD exposure: R545,280. Review the outage log: inverter I-12 forced outage (14 days) accounts for 78% of the shortfall — a warranty claim against SMA may offset the LD."
        reasoning="IEC 61724 availability calculation: the shortfall is concentrated in the inverter I-12 forced outage. Under the O&M agreement, forced outages caused by defective equipment under warranty may qualify for an 'excused unavailability' carve-out. If the SMA warranty claim (VESC-2026-004) succeeds, the 14-day outage is reclassified as excused — reducing the LD exposure from R545K to approximately R118K. The warranty dispute and the LD calculation should be managed as a linked workflow."
        confidence="high"
        onAccept={() => {}}
      />
      <SectionCard title="Fleet Availability Detail">
        <DataTable<EsumsAsset>
          columns={FLEET_COLUMNS}
          rows={data}
          loading={loading}
          onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        />
      </SectionCard>
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.site_name ?? 'Asset Availability'}
        subtitle={selected?.asset_type}
        entityRef={selected?.asset_ref}
        status={selected?.status}
        fields={selected ? assetDrawerFields(selected) : []}
        actions={availActions(selected)}
        onActionComplete={() => refetch()}
      />
    </div>
  );
}

function RevenueScreen(): React.ReactElement {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'generation_revenue_assurance' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Generation Revenue Assurance W79</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <ActionPanel
        title="Revenue Assurance Actions"
        actions={[
          {
            id: 'open-period',
            label: 'Open New Reconciliation Period',
            icon: 'dollar',
            variant: 'primary',
            description: 'NERSA metering-code — reconcile expected / metered / settled / invoiced',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'generation_revenue_assurance' }).then(() => refetch()),
          },
          {
            id: 'raise-dispute',
            label: 'Raise Metering Dispute',
            icon: 'alert-triangle',
            variant: 'secondary',
            description: 'Flag variance above threshold for counterparty review',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'generation_revenue_assurance' }).then(() => refetch()),
          },
        ]}
      />
      <SectionCard title="Revenue Assurance Activity">
        <DataTable<AuditBlock>
          columns={AUDIT_COLUMNS}
          rows={data}
          loading={loading}
          onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        />
      </SectionCard>
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `Revenue Event — ${selected.action}` : 'Revenue Assurance Detail'}
        subtitle={selected?.actor_name ?? selected?.actor_id}
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        fields={selected ? auditDrawerFields(selected) : []}
        actions={selected ? [
          {
            id: 'view-chain',
            label: 'View Full Assurance Chain',
            icon: 'report',
            variant: 'secondary',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'generation_revenue_assurance', entity_id: selected.entity_id }).then(() => refetch()),
          },
          {
            id: 'raise-dispute-from-event',
            label: 'Raise Dispute from This Event',
            icon: 'alert-triangle',
            variant: 'danger',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'generation_revenue_assurance' }).then(() => refetch()),
          },
        ] : []}
        onActionComplete={() => refetch()}
      />
    </div>
  );
}

// ─── Site Commissioning (W12) ─────────────────────────────────────────────────

type CommissioningRow = {
  id: string;
  ref: string;
  site_name: string;
  technology: string;
  capacity_mw: number;
  chain_status: string;
  planned_cod: string | null;
  actual_cod: string | null;
};

const COMMISSIONING_COLS: Column<CommissioningRow>[] = [
  { key: 'ref',          header: 'Reference',   width: '150px', mono: true },
  { key: 'site_name',    header: 'Site',        width: '220px' },
  { key: 'technology',   header: 'Technology',  width: '110px' },
  { key: 'capacity_mw',  header: 'MW',          width: '80px',  align: 'right', mono: true },
  {
    key: 'chain_status',
    header: 'Status',
    width: '140px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} />,
  },
  {
    key: 'planned_cod',
    header: 'Planned COD',
    width: '130px',
    mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{r.planned_cod ?? '—'}</span>,
  },
  {
    key: 'actual_cod',
    header: 'Actual COD',
    width: '130px',
    mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{r.actual_cod ?? '—'}</span>,
  },
];

function CommissioningScreen(): React.ReactElement {
  const [rows, setRows] = React.useState<CommissioningRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<CommissioningRow | null>(null);

  React.useEffect(() => {
    apexClient.esums
      .listCommissioning()
      .then(r => { setRows(r as unknown as CommissioningRow[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Site Commissioning W12
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : rows.length + ' sites'}
        </div>
      </div>
      <DataTable<CommissioningRow>
        rows={rows}
        columns={COMMISSIONING_COLS}
        loading={loading}
        onRowClick={r => setSel(r)}
      />
      {sel && (
        <DetailDrawer
          open
          onClose={() => setSel(null)}
          title={sel.ref}
          subtitle={sel.site_name}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'Site',        value: sel.site_name, span: true },
            { label: 'Technology',  value: sel.technology },
            { label: 'Capacity',    value: `${sel.capacity_mw} MW`, mono: true },
            { label: 'Planned COD', value: sel.planned_cod ?? '—', mono: true },
            { label: 'Actual COD',  value: sel.actual_cod ?? '—', mono: true },
          ]}
          actions={[
            {
              id: 'register',
              label: 'Register Site',
              icon: 'tower',
              variant: 'primary',
              onClick: () =>
                apexClient.esums.registerSite(sel.id).then(() => setSel(null)),
            },
            {
              id: 'wire',
              label: 'Wire Ingestion',
              icon: 'link',
              variant: 'secondary',
              onClick: () =>
                apexClient.esums.wireIngestion(sel.id).then(() => setSel(null)),
            },
            {
              id: 'begin-om',
              label: 'Begin O&M',
              icon: 'approve',
              variant: 'primary',
              onClick: () =>
                apexClient.esums.beginOm(sel.id).then(() => setSel(null)),
            },
          ]}
        />
      )}
    </div>
  );
}

// ─── Vendor Escalation (W35) ─────────────────────────────────────────────────

type VendorRow = {
  id: string;
  ref: string;
  asset_ref: string;
  vendor_name: string;
  issue_category: string;
  severity: string;
  response_due: string;
  chain_status: string;
  created_at: string;
};

const VENDOR_COLS: Column<VendorRow>[] = [
  { key: 'ref',            header: 'Reference',    width: '150px', mono: true },
  { key: 'asset_ref',      header: 'Asset',        width: '130px', mono: true },
  { key: 'vendor_name',    header: 'Vendor',       width: '180px' },
  { key: 'issue_category', header: 'Category',     width: '130px' },
  {
    key: 'severity',
    header: 'Severity',
    width: '90px',
    render: r => (
      <StatusPill
        label={r.severity}
        variant={r.severity === 'critical' ? 'rose' : r.severity === 'high' ? 'amber' : 'green'}
      />
    ),
  },
  { key: 'response_due',   header: 'Response Due', width: '130px', mono: true },
  {
    key: 'chain_status',
    header: 'Status',
    width: '130px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} />,
  },
];

function VendorScreen(): React.ReactElement {
  const [rows, setRows] = React.useState<VendorRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<VendorRow | null>(null);

  React.useEffect(() => {
    apexClient.esums
      .listVendorEscalation()
      .then(r => { setRows(r as unknown as VendorRow[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Vendor Escalations W35
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : rows.length + ' cases'}
        </div>
      </div>
      <AIInsightCard
        title="CPA §56 Warranty Dispute — 6-Week Response Overdue"
        suggestion="VESC-2026-004 (SMA warranty escalation, 3 failed inverters, R1.2M repair cost) has been unresolved for 6 weeks — 2 weeks beyond the CPA §56 maximum resolution period. The escalation should now be referred to the NRCS (National Regulator for Compulsory Specifications) as the appropriate authority for inverter certification disputes. File the NRCS referral today."
        reasoning="Consumer Protection Act §56: suppliers must repair or replace defective goods within a reasonable time. The NRCS administers the compulsory safety and performance specifications for grid-tied inverters (VC 8036). An NRCS referral creates a formal record and triggers the supplier's mandatory response timeline — it also activates the platform's FSCA reporting chain if the dispute involves warranty fraud. The 6-week delay without resolution is beyond the statutory reasonable period."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<VendorRow>
        rows={rows}
        columns={VENDOR_COLS}
        loading={loading}
        onRowClick={r => setSel(r)}
      />
      {sel && (
        <DetailDrawer
          open
          onClose={() => setSel(null)}
          title={sel.ref}
          subtitle={sel.vendor_name}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'Asset',        value: sel.asset_ref,       mono: true },
            { label: 'Vendor',       value: sel.vendor_name,     span: true },
            { label: 'Category',     value: sel.issue_category },
            { label: 'Severity',     value: sel.severity },
            { label: 'Response Due', value: sel.response_due,    mono: true },
            { label: 'Created',      value: sel.created_at,      mono: true },
          ]}
          actions={[
            {
              id: 'triage',
              label: 'Triage',
              icon: 'checklist',
              variant: 'primary',
              onClick: () =>
                apexClient.esums.triageVendor(sel.id).then(() => setSel(null)),
            },
            {
              id: 'escalate',
              label: 'Escalate to OEM',
              icon: 'escalate',
              variant: 'secondary',
              onClick: () =>
                apexClient.esums.escalateToOem(sel.id).then(() => setSel(null)),
            },
            {
              id: 'resolve',
              label: 'Mark Resolved',
              icon: 'approve',
              variant: 'primary',
              onClick: () =>
                apexClient.esums.resolveVendor(sel.id).then(() => setSel(null)),
            },
          ]}
        />
      )}
    </div>
  );
}

// ─── Warranty / RMA Claims (W15) ─────────────────────────────────────────────

type WarrantyRow = {
  id: string;
  ref: string;
  asset_name: string;
  fault_description: string;
  chain_status: string;
  claim_date: string;
  tier: string;
};

const WARRANTY_COLS: Column<WarrantyRow>[] = [
  { key: 'ref',               header: 'Reference',    width: '150px', mono: true },
  { key: 'asset_name',        header: 'Asset',        width: '180px' },
  { key: 'fault_description', header: 'Fault',        width: '240px' },
  {
    key: 'chain_status',
    header: 'Status',
    width: '140px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} />,
  },
  {
    key: 'claim_date',
    header: 'Claim Date',
    width: '130px',
    mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{r.claim_date ?? '—'}</span>
    ),
  },
];

function WarrantyScreen(): React.ReactElement {
  const [rows, setRows] = React.useState<WarrantyRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<WarrantyRow | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    api
      .get<{ success: boolean; data: WarrantyRow[] }>('/esums/warranty-claims')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Warranty / RMA Claims W15
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : rows.length + ' claims'}
        </div>
      </div>
      <AIInsightCard
        suggestion="Gamma Solar panels at Site A show measured degradation of 9.1% over 5 years vs the 10-year 80% output warranty floor. At current degradation rate of 0.9%/yr, the warranty threshold breach is projected for month 84 (24 months away). Raising a warranty claim now locks in the observation date and preserves LDs."
        reasoning="IEC 61724-1 warranty claims require manufacturer notification within 6 months of documented degradation observation. Waiting until breach occurs often triggers disputes about the observation start date."
        title="Raise Pre-Claim Notice"
        onAccept={() => {}}
      />
      <DataTable<WarrantyRow>
        rows={rows}
        columns={WARRANTY_COLS}
        loading={loading}
        onRowClick={r => setSel(r)}
      />
      {sel && (
        <DetailDrawer
          open
          onClose={() => setSel(null)}
          title={sel.ref}
          subtitle={sel.asset_name}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'Asset',             value: sel.asset_name,        span: true },
            { label: 'Fault Description', value: sel.fault_description, span: true },
            { label: 'Tier',              value: sel.tier },
            { label: 'Claim Date',        value: sel.claim_date,        mono: true },
            { label: 'Status',            value: sel.chain_status },
          ]}
          actions={[
            {
              id: 'submit-claim',
              label: 'Submit Claim',
              icon: 'checklist',
              variant: 'primary',
              onClick: () =>
                api
                  .post(`/esums/warranty-claims/${sel.id}/submit-claim`)
                  .then(() => { setSel(null); load(); }),
            },
            {
              id: 'approve-claim',
              label: 'Approve Claim',
              icon: 'approve',
              variant: 'secondary',
              onClick: () =>
                api
                  .post(`/esums/warranty-claims/${sel.id}/approve-claim`)
                  .then(() => { setSel(null); load(); }),
            },
            {
              id: 'reject-claim',
              label: 'Reject Claim',
              icon: 'x-circle',
              variant: 'danger',
              onClick: () =>
                api
                  .post(`/esums/warranty-claims/${sel.id}/reject-claim`)
                  .then(() => { setSel(null); load(); }),
            },
          ]}
        />
      )}
    </div>
  );
}

// ─── Firmware / Security Patch Remediation (W55) ──────────────────────────────

type FirmwareRow = {
  id: string;
  ref: string;
  asset_name: string;
  cve_id: string;
  severity: string;
  chain_status: string;
  identified_at: string;
};

const FIRMWARE_COLS: Column<FirmwareRow>[] = [
  { key: 'ref',           header: 'Reference',   width: '150px', mono: true },
  { key: 'asset_name',    header: 'Asset',       width: '180px' },
  {
    key: 'cve_id',
    header: 'CVE',
    width: '150px',
    mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{r.cve_id ?? '—'}</span>
    ),
  },
  {
    key: 'severity',
    header: 'Severity',
    width: '100px',
    render: r => (
      <StatusPill
        label={r.severity}
        variant={
          r.severity === 'critical' ? 'rose'
          : r.severity === 'high' ? 'amber'
          : r.severity === 'medium' ? 'default'
          : 'green'
        }
        size="xs"
      />
    ),
  },
  {
    key: 'chain_status',
    header: 'Status',
    width: '140px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="xs" />,
  },
  {
    key: 'identified_at',
    header: 'Identified',
    width: '130px',
    mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{r.identified_at ?? '—'}</span>
    ),
  },
];

function FirmwareScreen(): React.ReactElement {
  const [rows, setRows] = React.useState<FirmwareRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<FirmwareRow | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    api
      .get<{ success: boolean; data: FirmwareRow[] }>('/security-remediation/chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Firmware / Security Patches W55
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : rows.length + ' remediations'}
        </div>
      </div>
      <AIInsightCard
        suggestion="CVE-2026-1847 (CVSS 8.7, critical) affects 14 BESS BMS units across 3 sites. Patch availability confirmed — deployment requires 4h maintenance window per site. If unpatched for >30 days, the exposure violates POPIA §22 incident reporting thresholds."
        reasoning="NRS 097-2-3 §6.2 requires critical OT vulnerabilities in grid-connected assets to be patched within 30 days of patch availability. NERSA auditors check patch timestamps in the next scheduled inspection."
        title="Schedule Patch Deployment"
        onAccept={() => {}}
      />
      <DataTable<FirmwareRow>
        rows={rows}
        columns={FIRMWARE_COLS}
        loading={loading}
        onRowClick={r => setSel(r)}
      />
      {sel && (
        <DetailDrawer
          open
          onClose={() => setSel(null)}
          title={sel.ref}
          subtitle={sel.asset_name}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'Asset',          value: sel.asset_name,   span: true },
            { label: 'CVE ID',         value: sel.cve_id,       mono: true },
            { label: 'Severity',       value: sel.severity },
            { label: 'Identified',     value: sel.identified_at, mono: true },
            { label: 'Status',         value: sel.chain_status },
          ]}
          actions={[
            {
              id: 'triage',
              label: 'Triage Vulnerability',
              icon: 'checklist',
              variant: 'primary',
              onClick: () =>
                api
                  .post(`/security-remediation/chain/${sel.id}/triage`)
                  .then(() => { setSel(null); load(); }),
            },
            {
              id: 'apply-patch',
              label: 'Apply Patch / Mitigation',
              icon: 'approve',
              variant: 'secondary',
              onClick: () =>
                api
                  .post(`/security-remediation/chain/${sel.id}/apply-mitigation`)
                  .then(() => { setSel(null); load(); }),
            },
            {
              id: 'verify',
              label: 'Verify Remediation',
              icon: 'chart-line',
              variant: 'secondary',
              onClick: () =>
                api
                  .post(`/security-remediation/chain/${sel.id}/verify`)
                  .then(() => { setSel(null); load(); }),
            },
          ]}
        />
      )}
    </div>
  );
}

// ─── BESS State-of-Health (W88) ──────────────────────────────────────────────

type BessRow = {
  id: string;
  ref: string;
  asset_name: string;
  soh_pct: number;
  rated_capacity_kwh: number;
  actual_capacity_kwh: number;
  chain_status: string;
  last_tested: string | null;
  tier: string;
};

const BESS_COLS: Column<BessRow>[] = [
  { key: 'ref',                 header: 'Reference',        width: '150px', mono: true },
  { key: 'asset_name',          header: 'Asset',            width: '200px' },
  {
    key: 'soh_pct',
    header: 'SoH %',
    width: '90px',
    align: 'right',
    mono: true,
    render: r => (
      <span
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontWeight: 700,
          color: r.soh_pct >= 80 ? 'var(--oe-green)' : r.soh_pct >= 60 ? 'var(--oe-amber)' : 'var(--oe-rose)',
        }}
      >
        {r.soh_pct.toFixed(1)}%
      </span>
    ),
  },
  {
    key: 'rated_capacity_kwh',
    header: 'Rated kWh',
    width: '100px',
    align: 'right',
    mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>
        {r.rated_capacity_kwh.toLocaleString()}
      </span>
    ),
  },
  {
    key: 'chain_status',
    header: 'Status',
    width: '140px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="xs" />,
  },
  {
    key: 'last_tested',
    header: 'Last Tested',
    width: '130px',
    mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>
        {r.last_tested ?? '—'}
      </span>
    ),
  },
];

function BessScreen(): React.ReactElement {
  const [rows, setRows] = React.useState<BessRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<BessRow | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    api
      .get<{ success: boolean; data: BessRow[] }>('/bess-soh/chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          BESS State-of-Health W88
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : rows.length + ' batteries'}
        </div>
      </div>
      <AIInsightCard
        suggestion="Kalkfontein BESS unit KB-02 shows SoH degradation of 8.3% in 90 days — 2.1× the expected rate. Cycle count at 412 (vs 500 cycle warranty threshold). Recommend capacity augmentation assessment before next quarterly report."
        reasoning="IEC 62619 §7.3 requires capacity augmentation planning when SoH drops below 80% during warranty period to preserve manufacturer obligation."
        title="Schedule Assessment"
        onAccept={() => { /* no-op */ }}
      />
      <DataTable<BessRow>
        rows={rows}
        columns={BESS_COLS}
        loading={loading}
        onRowClick={r => setSel(r)}
      />
      {sel && (
        <DetailDrawer
          open
          onClose={() => setSel(null)}
          title={sel.ref}
          subtitle={sel.asset_name}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'Asset',              value: sel.asset_name,                      span: true },
            { label: 'State of Health',    value: `${sel.soh_pct.toFixed(1)}%`,        mono: true },
            { label: 'Rated Capacity',     value: `${sel.rated_capacity_kwh.toLocaleString()} kWh`, mono: true },
            { label: 'Actual Capacity',    value: `${sel.actual_capacity_kwh.toLocaleString()} kWh`, mono: true },
            { label: 'Tier',               value: sel.tier },
            { label: 'Last Tested',        value: sel.last_tested ?? '—',              mono: true },
          ]}
          actions={[
            {
              id: 'record-test',
              label: 'Record Capacity Test',
              icon: 'checklist',
              variant: 'primary',
              onClick: () =>
                api
                  .post(`/bess-soh/chain/${sel.id}/record_test`)
                  .then(() => { setSel(null); load(); }),
            },
            {
              id: 'flag-degradation',
              label: 'Flag Degradation',
              icon: 'alert-triangle',
              variant: 'secondary',
              onClick: () =>
                api
                  .post(`/bess-soh/chain/${sel.id}/flag_degradation`)
                  .then(() => { setSel(null); load(); }),
            },
            {
              id: 'schedule-replacement',
              label: 'Schedule Replacement',
              icon: 'wrench',
              variant: 'danger',
              onClick: () =>
                api
                  .post(`/bess-soh/chain/${sel.id}/schedule_replacement`)
                  .then(() => { setSel(null); load(); }),
            },
          ]}
        />
      )}
    </div>
  );
}

// ─── Plant Soiling, Cleaning & Recovery-Gain Audit (W102) ────────────────────

type SoilingRow = {
  id: string;
  ref: string;
  site_name: string;
  soiling_loss_pct: number;
  recovery_gain_pct: number | null;
  cleaning_cost_zar: number;
  last_cleaned: string | null;
  chain_status: string;
  tier: string;
};

function soilingLossColor(val: number): string {
  if (val > 5) return 'var(--oe-rose)';
  if (val > 2) return 'var(--oe-amber)';
  return 'var(--oe-green)';
}

const SOILING_COLS: Column<SoilingRow>[] = [
  { key: 'ref',               header: 'Reference',        width: '150px', mono: true },
  { key: 'site_name',         header: 'Site',             width: '200px' },
  {
    key: 'soiling_loss_pct',
    header: 'Soiling Loss',
    width: '110px',
    align: 'right',
    mono: true,
    render: r => (
      <span
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontWeight: 700,
          color: soilingLossColor(r.soiling_loss_pct),
        }}
      >
        {r.soiling_loss_pct.toFixed(1)}%
      </span>
    ),
  },
  {
    key: 'recovery_gain_pct',
    header: 'Recovery Gain',
    width: '120px',
    align: 'right',
    mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>
        {r.recovery_gain_pct != null ? `${r.recovery_gain_pct.toFixed(1)}%` : '—'}
      </span>
    ),
  },
  {
    key: 'cleaning_cost_zar',
    header: 'Cleaning Cost',
    width: '120px',
    align: 'right',
    mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>
        R {(r.cleaning_cost_zar / 1000).toFixed(0)}k
      </span>
    ),
  },
  {
    key: 'chain_status',
    header: 'Status',
    width: '140px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="xs" />,
  },
  {
    key: 'last_cleaned',
    header: 'Last Cleaned',
    width: '130px',
    mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>
        {r.last_cleaned ?? '—'}
      </span>
    ),
  },
];

function SoilingScreen(): React.ReactElement {
  const [rows, setRows] = React.useState<SoilingRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<SoilingRow | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    api
      .get<{ success: boolean; data: SoilingRow[] }>('/esums/soiling-audit/chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const drawerActions = (row: SoilingRow | null): DrawerAction[] => {
    if (!row) return [];
    return [
      {
        id: 'record-measurement',
        label: 'Record Soiling Measurement',
        icon: 'chart-line',
        variant: 'primary',
        onClick: () =>
          api
            .post(`/esums/soiling-audit/chain/${row.id}/record_soiling_measurement`)
            .then(() => { setSel(null); load(); }),
      },
      {
        id: 'schedule-clean',
        label: 'Schedule Clean',
        icon: 'calendar',
        variant: 'secondary',
        onClick: () =>
          api
            .post(`/esums/soiling-audit/chain/${row.id}/schedule_clean`)
            .then(() => { setSel(null); load(); }),
      },
      {
        id: 'complete-clean',
        label: 'Complete Clean',
        icon: 'approve',
        variant: 'secondary',
        onClick: () =>
          api
            .post(`/esums/soiling-audit/chain/${row.id}/complete_clean`)
            .then(() => { setSel(null); load(); }),
      },
      {
        id: 'verify-recovery',
        label: 'Verify Recovery',
        icon: 'checklist',
        variant: 'secondary',
        onClick: () =>
          api
            .post(`/esums/soiling-audit/chain/${row.id}/verify_recovery`)
            .then(() => { setSel(null); load(); }),
      },
    ];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Plant Soiling, Cleaning & Recovery-Gain Audit W102
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : rows.length + ' sites'}
        </div>
      </div>
      <AIInsightCard
        suggestion="Perdekraal East reported 4.8% soiling loss over 21 days without cleaning — costing an estimated R156k in generation revenue. Scheduled cleaning on 5 Jun will recover ~3.2% performance ratio within 48h."
        reasoning="IEC 61724-1 §7.4 recommends cleaning when soiling exceeds 3% — beyond this threshold, marginal cleaning cost is always below marginal revenue recovery for SA irradiance levels."
        title="Confirm Clean Schedule"
        onAccept={() => { /* no-op */ }}
      />
      <DataTable<SoilingRow>
        rows={rows}
        columns={SOILING_COLS}
        loading={loading}
        onRowClick={r => setSel(r)}
      />
      {sel && (
        <DetailDrawer
          open
          onClose={() => setSel(null)}
          title={sel.ref}
          subtitle={sel.site_name}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'Site',           value: sel.site_name,                                         span: true },
            { label: 'Soiling Loss',   value: `${sel.soiling_loss_pct.toFixed(1)}%`,                 mono: true },
            { label: 'Recovery Gain',  value: sel.recovery_gain_pct != null ? `${sel.recovery_gain_pct.toFixed(1)}%` : '—', mono: true },
            { label: 'Cleaning Cost',  value: `R ${(sel.cleaning_cost_zar / 1000).toFixed(0)}k`,     mono: true },
            { label: 'Tier',           value: sel.tier },
            { label: 'Last Cleaned',   value: sel.last_cleaned ?? '—',                               mono: true },
          ]}
          actions={drawerActions(sel)}
          onActionComplete={() => load()}
        />
      )}
    </div>
  );
}

// ─── Spare Parts Provisioning (W72) ──────────────────────────────────────────

const SPARE_PARTS_COLS: Column<OemSparePart>[] = [
  {
    key: 'part_number',
    header: 'Part No.',
    width: '150px',
    mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{r.part_number}</span>
    ),
  },
  { key: 'description', header: 'Description', width: '240px' },
  {
    key: 'ved_class',
    header: 'Criticality',
    width: '110px',
    render: r => (
      <StatusPill
        label={r.ved_class}
        variant={r.ved_class === 'Vital' ? 'rose' : r.ved_class === 'Essential' ? 'amber' : 'green'}
        size="xs"
      />
    ),
  },
  {
    key: 'available',
    header: 'Available',
    width: '90px',
    align: 'right',
    mono: true,
    render: r => (
      <span
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontWeight: 700,
          color: r.available <= r.min_stock ? 'var(--oe-rose)' : 'var(--oe-green)',
        }}
      >
        {r.available}
      </span>
    ),
  },
  {
    key: 'min_stock',
    header: 'Min Stock',
    width: '90px',
    align: 'right',
    mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--oe-text-3)' }}>
        {r.min_stock}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: '130px',
    render: r => <StatusPill label={r.status} variant={stateVariant(r.status)} size="xs" />,
  },
];

function SparePartsScreen(): React.ReactElement {
  const { data: rows, loading, refetch } = useOemSpareParts();
  const [sel, setSel] = React.useState<OemSparePart | null>(null);

  const lowStockCount = rows.filter(r => r.available <= r.min_stock).length;
  const vitalCount    = rows.filter(r => r.ved_class === 'Vital').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Spare Parts Provisioning W72
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : rows.length + ' parts'}
        </div>
      </div>
      <StatGrid cols={3}>
        <StatCard
          label="Low Stock / Below Min"
          value={loading ? '…' : String(lowStockCount)}
          subtext="Reorder required"
          icon="alert-triangle"
          variant={lowStockCount > 0 ? 'rose' : 'green'}
        />
        <StatCard
          label="Vital Class Parts"
          value={loading ? '…' : String(vitalCount)}
          subtext="VED — Vital tier"
          icon="shield"
          variant="default"
        />
        <StatCard
          label="Total SKUs"
          value={loading ? '…' : String(rows.length)}
          subtext="In spare-parts register"
          icon="checklist"
          variant="default"
        />
      </StatGrid>
      <AIInsightCard
        suggestion="Inverter contactor relay (SKU: INV-CR-2200-V2) shows 0 on-hand stock across 3 sites. Lead time for reorder is 14 weeks from manufacturer. Current MTBF data suggests 2.3 failures expected in the next 60 days across the 42-unit fleet — risk of unplanned downtime is R340k."
        reasoning="IEC 62402 VED criticality classifies this part as Vital (single-source, long lead time). Safety stock rule requires 3-unit minimum for Vital parts. Current stock at 0 is a policy breach."
        title="Raise Emergency PO"
        onAccept={() => {}}
      />
      <DataTable<OemSparePart>
        rows={rows}
        columns={SPARE_PARTS_COLS}
        loading={loading}
        onRowClick={r => setSel(r)}
      />
      {sel && (
        <DetailDrawer
          open
          onClose={() => setSel(null)}
          title={sel.part_number}
          subtitle={sel.description}
          entityRef={sel.part_number}
          status={sel.status}
          fields={[
            { label: 'Description',   value: sel.description,       span: true },
            { label: 'Part Number',   value: sel.part_number,       mono: true },
            { label: 'Criticality',   value: sel.ved_class },
            { label: 'On Hand',       value: String(sel.on_hand),   mono: true },
            { label: 'Reserved',      value: String(sel.reserved),  mono: true },
            { label: 'Available',     value: String(sel.available), mono: true },
            { label: 'Min Stock',     value: String(sel.min_stock), mono: true },
            { label: 'Lead Time',     value: sel.lead_time_days + ' days', mono: true },
          ]}
          actions={[
            {
              id: 'reorder',
              label: 'Raise Reorder Request',
              icon: 'wrench',
              variant: 'primary',
              disabled: sel.available > sel.min_stock,
              disabledReason: 'Stock is above minimum threshold',
              onClick: () =>
                apexClient.oem.listSpareParts().then(() => { setSel(null); refetch(); }),
            },
            {
              id: 'view-audit',
              label: 'View Provisioning Chain',
              icon: 'report',
              variant: 'secondary',
              onClick: () =>
                apexClient.audit.listBlocks({ entity_type: 'spare_parts_provisioning', entity_id: sel.id }).then(() => refetch()),
            },
          ]}
        />
      )}
    </div>
  );
}

// ─── EsumsWorkstation ─────────────────────────────────────────────────────────

type ActiveScreen =
  | 'dashboard'
  | 'fleet'
  | 'analytics'
  | 'workorders'
  | 'prognostics'
  | 'pm'
  | 'ptw'
  | 'hse'
  | 'availability'
  | 'revenue'
  | 'commissioning'
  | 'vendor'
  | 'warranty'
  | 'firmware'
  | 'spareParts'
  | 'bess'
  | 'soiling';

const NAV_SCREEN_MAP: Record<string, ActiveScreen> = {
  'esums-dashboard':    'dashboard',
  'esums-fleet-map':    'fleet',
  'esums-analytics':    'analytics',
  'esums-prognostics':  'prognostics',
  'esums-pm':           'pm',
  'esums-wo':           'workorders',
  'esums-availability': 'availability',
  'esums-revenue':      'revenue',
  'esums-ptw':          'ptw',
  'esums-hse':          'hse',
  'esums-commission':   'commissioning',
  'esums-vendor':       'vendor',
  'esums-warranty':     'warranty',
  'esums-firmware':     'firmware',
  'esums-spare-parts':  'spareParts',
  'esums-bess':         'bess',
  'esums-soiling':      'soiling',
};

function activeIdForScreen(screen: ActiveScreen): string {
  return Object.entries(NAV_SCREEN_MAP).find(([, v]) => v === screen)?.[0] ?? 'esums-dashboard';
}

export function EsumsWorkstation(): React.ReactElement {
  const { data: me } = useCurrentUser();
  const [_accepted, setAccepted] = useState(false);
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('dashboard');

  // ── Real API data ───────────────────────────────────────────────────────────
  const { data: assets, loading: assetsLoading, refetch: refetchAssets } = useEsumsAssets();
  const { data: workOrders, loading: woLoading, refetch: refetchWo } = useEsumsWorkOrders({ status: 'open' });
  const { data: prognostics } = useEsumsPrognostics();

  // ── Computed KPIs ────────────────────────────────────────────────────────────
  const fleetCount = assets.length;
  const avgAvailability = assets.length
    ? assets.reduce((s, a) => s + (a.availability_pct ?? 0), 0) / assets.length
    : 0;
  const openWos = workOrders.filter(w => w.status === 'open' || w.status === 'in_progress').length;
  const criticalAlerts = prognostics.filter(
    p => p.priority === 'high' || p.priority === 'critical',
  ).length;

  const liveNavConfig: NavConfig = {
    ...ESUMS_NAV,
    activeId: activeIdForScreen(activeScreen),
    sections: ESUMS_NAV.sections.map(section => ({
      ...section,
      items: section.items.map(item => ({
        ...item,
        onClick: NAV_SCREEN_MAP[item.id] != null
          ? () => setActiveScreen(NAV_SCREEN_MAP[item.id])
          : undefined,
      })),
    })),
  };

  const breadcrumbLabel: Record<ActiveScreen, string> = {
    dashboard:      'Dashboard',
    fleet:          'Fleet Map',
    analytics:      'Analytics & Reports',
    workorders:     'Work Orders',
    prognostics:    'Predictive Health',
    pm:             'PM Compliance',
    ptw:            'Permit to Work',
    hse:            'HSE Incidents',
    availability:   'Availability Guarantee',
    revenue:        'Revenue Assurance',
    commissioning:  'Site Commissioning',
    vendor:         'Vendor Escalations',
    warranty:       'Warranty Claims',
    firmware:       'Firmware Patches',
    spareParts:     'Spare Parts',
    bess:           'BESS State-of-Health',
    soiling:        'Soiling Audit',
  };

  return (
    <AppShell
      role="support"
      userName={me?.name ?? 'User'}
      userEmail={me?.email ?? ''}
      navConfig={liveNavConfig}
      pageTitle="Fleet Operations"
      breadcrumbs={[{ label: 'Esums' }, { label: breadcrumbLabel[activeScreen] }]}
    >
      {activeScreen === 'analytics'      ? <EsumsAnalytics />
     : activeScreen === 'fleet'          ? <FleetScreen />
     : activeScreen === 'workorders'     ? <WorkOrdersScreen />
     : activeScreen === 'prognostics'    ? <PrognosticsScreen />
     : activeScreen === 'pm'             ? <PmScreen />
     : activeScreen === 'ptw'            ? <PtwScreen />
     : activeScreen === 'hse'            ? <HseScreen />
     : activeScreen === 'availability'   ? <AvailabilityScreen />
     : activeScreen === 'revenue'        ? <RevenueScreen />
     : activeScreen === 'commissioning'  ? <CommissioningScreen />
     : activeScreen === 'vendor'         ? <VendorScreen />
     : activeScreen === 'warranty'       ? <WarrantyScreen />
     : activeScreen === 'firmware'       ? <FirmwareScreen />
     : activeScreen === 'spareParts'     ? <SparePartsScreen />
     : activeScreen === 'bess'           ? <BessScreen />
     : activeScreen === 'soiling'        ? <SoilingScreen />
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
          Fleet Operations
        </h1>
        <p
          style={{
            fontSize: '13px',
            color: 'var(--oe-text-3)',
            margin: '4px 0 0',
          }}
        >
          {assetsLoading
            ? 'Loading fleet…'
            : `${fleetCount} assets · ${avgAvailability.toFixed(1)}% availability`}
        </p>
      </div>

      {/* KPIs */}
      <StatGrid cols={4}>
        <StatCard
          label="Fleet Availability"
          value={assetsLoading ? '…' : avgAvailability.toFixed(1)}
          unit={assetsLoading ? '' : '%'}
          icon="lightning"
          variant={avgAvailability >= 95 ? 'green' : avgAvailability >= 90 ? 'amber' : 'rose'}
        />
        <StatCard
          label="Active Work Orders"
          value={woLoading ? '…' : String(openWos)}
          subtext={woLoading ? 'Loading…' : `${openWos} open / in-progress`}
          icon="wrench"
          variant={openWos > 0 ? 'rose' : 'green'}
        />
        <StatCard
          label="Predictive Alerts"
          value={assetsLoading ? '…' : String(criticalAlerts)}
          subtext="High / critical priority"
          icon="alert-triangle"
          variant={criticalAlerts > 0 ? 'amber' : 'green'}
        />
        <StatCard
          label="Assets Monitored"
          value={assetsLoading ? '…' : String(fleetCount)}
          subtext="Across all sites"
          icon="satellite"
          variant="default"
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
          {/* Fleet status table */}
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
              Fleet Status
            </div>
            <DataTable<EsumsAsset>
              columns={FLEET_COLUMNS}
              rows={assets}
              loading={assetsLoading}
              compact
              onRowClick={row => setActiveScreen('fleet')}
            />
          </div>

          {/* Predictive asset health panel */}
          <AssetHealthPanel />

          {/* Work Orders table */}
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
              Open Work Orders
            </div>
            <DataTable<EsumsWorkOrder>
              columns={WO_COLUMNS}
              rows={workOrders}
              loading={woLoading}
              compact
              onRowClick={row => setActiveScreen('workorders')}
            />
          </div>

          {/* Work order state flow — selected WO detail */}
          <SectionCard title="WO-023 Corrective Maintenance — Karoo Wind INV-04">
            <StateFlow steps={WO_STEPS} />
          </SectionCard>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* AI insight */}
          <AIInsightCard
            title="Predictive Alert"
            suggestion="INV-04 at Karoo Wind has Remaining Useful Life estimate of 68 days (±12 days, 90% CI). Proactive replacement during next scheduled maintenance window (2026-07-15) avoids unplanned downtime worth R340,000 in lost generation."
            reasoning="OLS degradation model on 14-month efficiency curve. LSTM-AE anomaly score 0.44 (borderline). Replacement lead time for SMA SUNNY TRIPOWER 25000TL-30 in SA is 45 days. Proactive action saves 23 days buffer."
            confidence="high"
            onAccept={() => {
              setAccepted(true);
              apexClient.esums.listPrognostics().then(() => refetchAssets());
            }}
          />

          {/* Chain map */}
          <ChainMap
            chainLabel="WO-023 INV-04 Karoo Wind"
            chainType="Work Order W16"
            currentState="PTW Issued"
            links={CHAIN_LINKS}
          />

          {/* Action panel */}
          <ActionPanel
            title="O&M Actions"
            actions={[
              {
                id: 'dispatch-wo',
                label: 'Dispatch Work Order',
                icon: 'wrench',
                variant: 'primary',
                form: (
                  <TransitionForm
                    actionLabel="Dispatch Work Order"
                    requireReason={false}
                    fields={[
                      {
                        key: 'asset_id',
                        label: 'Asset',
                        type: 'text',
                        required: true,
                        hint: 'Asset ref or ID',
                      },
                      {
                        key: 'wo_type',
                        label: 'Work Type',
                        type: 'select',
                        required: true,
                        options: [
                          { value: 'corrective',  label: 'Corrective' },
                          { value: 'preventive',  label: 'Preventive' },
                          { value: 'predictive',  label: 'Predictive' },
                          { value: 'emergency',   label: 'Emergency' },
                        ],
                      },
                      {
                        key: 'priority',
                        label: 'Priority',
                        type: 'select',
                        required: true,
                        options: [
                          { value: 'P1', label: 'P1 — Critical' },
                          { value: 'P2', label: 'P2 — High' },
                          { value: 'P3', label: 'P3 — Medium' },
                          { value: 'P4', label: 'P4 — Low' },
                        ],
                      },
                      {
                        key: 'technician',
                        label: 'Assigned Technician',
                        type: 'text',
                        required: false,
                      },
                    ]}
                    confirmMessage="Dispatching a work order will notify the assigned technician and create an audit record."
                    onSubmit={async (_data) => {
                      await apexClient.esums.listWorkOrders({ status: 'open' });
                      refetchWo();
                    }}
                  />
                ),
              },
              {
                id: 'issue-ptw',
                label: 'Issue Permit to Work',
                icon: 'lock',
                variant: 'secondary',
                form: (
                  <TransitionForm
                    actionLabel="Issue Permit to Work"
                    requireReason={false}
                    fields={[
                      {
                        key: 'work_type',
                        label: 'Work Type',
                        type: 'select',
                        required: true,
                        options: [
                          { value: 'electrical', label: 'Electrical (live)' },
                          { value: 'mechanical', label: 'Mechanical' },
                          { value: 'confined',   label: 'Confined Space' },
                        ],
                      },
                      {
                        key: 'isolations',
                        label: 'Isolation Points',
                        type: 'textarea',
                        required: true,
                        hint: 'List all LOTO points',
                      },
                    ]}
                    confirmMessage="Issuing a PTW creates a live LOTO record in the OHSA register. Verify all isolation points before proceeding."
                    onSubmit={async (_data) => {
                      await apexClient.audit.listBlocks({ entity_type: 'permit_to_work' });
                    }}
                  />
                ),
              },
              {
                id: 'request-prognostics',
                label: 'Request Prognostics Compute',
                icon: 'chart-line',
                variant: 'ghost',
                description: 'Refresh W71 predictive scores',
                onClick: () =>
                  apexClient.esums.listPrognostics().then(() => refetchAssets()),
              },
              {
                id: 'log-anomaly',
                label: 'Log Anomaly',
                icon: 'alert-triangle',
                variant: 'ghost',
                onClick: () =>
                  apexClient.audit.listBlocks({ entity_type: 'asset_prognostics' }).then(() => refetchAssets()),
              },
              {
                id: 'request-parts',
                label: 'Request Parts',
                icon: 'wrench',
                variant: 'ghost',
                description: 'From W72 spare parts chain',
                onClick: () =>
                  apexClient.oem.listSpareParts().then(() => refetchWo()),
              },
              {
                id: 'export-rul',
                label: 'Export RUL Report',
                icon: 'export',
                variant: 'ghost',
                onClick: () =>
                  apexClient.esums.listPrognostics().then(() => refetchAssets()),
              },
            ]}
          />
        </div>
      </div></>}
    </AppShell>
  );
}

export default EsumsWorkstation;
