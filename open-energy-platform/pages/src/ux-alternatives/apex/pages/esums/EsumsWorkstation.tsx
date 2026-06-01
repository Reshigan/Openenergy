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
  useEsumsAssets, useEsumsWorkOrders, useEsumsPrognostics, useAuditBlocks,
} from '../../lib/hooks';
import { EsumsAsset, EsumsWorkOrder, EsumsPrognostic, AuditBlock, apexClient } from '../../lib/client';

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
      ],
    },
    {
      id: 'performance',
      label: 'Performance',
      items: [
        { id: 'esums-availability', label: 'Availability Guarantee W51', href: '#availability', icon: 'checklist' },
        { id: 'esums-pr',           label: 'Performance Ratio W24',      href: '#pr',           icon: 'bar-chart' },
        { id: 'esums-revenue',      label: 'Revenue Assurance W79',      href: '#revenue',      icon: 'dollar', badge: 1, badgeVariant: 'amber' },
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
  | 'revenue';

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
};

function activeIdForScreen(screen: ActiveScreen): string {
  return Object.entries(NAV_SCREEN_MAP).find(([, v]) => v === screen)?.[0] ?? 'esums-dashboard';
}

export function EsumsWorkstation(): React.ReactElement {
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
    dashboard:    'Dashboard',
    fleet:        'Fleet Map',
    analytics:    'Analytics & Reports',
    workorders:   'Work Orders',
    prognostics:  'Predictive Health',
    pm:           'PM Compliance',
    ptw:          'Permit to Work',
    hse:          'HSE Incidents',
    availability: 'Availability Guarantee',
    revenue:      'Revenue Assurance',
  };

  return (
    <AppShell
      role="support"
      userName="Thabo Nkosi"
      userEmail="support@openenergy.co.za"
      navConfig={liveNavConfig}
      pageTitle="Fleet Operations"
      breadcrumbs={[{ label: 'Esums' }, { label: breadcrumbLabel[activeScreen] }]}
    >
      {activeScreen === 'analytics'    ? <EsumsAnalytics />
     : activeScreen === 'fleet'        ? <FleetScreen />
     : activeScreen === 'workorders'   ? <WorkOrdersScreen />
     : activeScreen === 'prognostics'  ? <PrognosticsScreen />
     : activeScreen === 'pm'           ? <PmScreen />
     : activeScreen === 'ptw'          ? <PtwScreen />
     : activeScreen === 'hse'          ? <HseScreen />
     : activeScreen === 'availability' ? <AvailabilityScreen />
     : activeScreen === 'revenue'      ? <RevenueScreen />
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
